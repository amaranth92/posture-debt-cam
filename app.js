import { FilesetResolver, PoseLandmarker, DrawingUtils } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/vision_bundle.mjs';

const $ = (id) => document.getElementById(id);
const els = {
  startBtn: $('startBtn'), soundBtn: $('soundBtn'), stage: $('stage'), video: $('webcam'), canvas: $('overlay'), fog: $('fog'),
  statusDot: $('statusDot'), postureLabel: $('postureLabel'), postureHint: $('postureHint'), bill: $('bill'), billLevel: $('billLevel'),
  neckCost: $('neckCost'), backCost: $('backCost'), therapyCost: $('therapyCost'), totalCost: $('totalCost'), billMessage: $('billMessage'),
  neckScore: $('neckScore'), slouchScore: $('slouchScore'), blurScore: $('blurScore'), fps: $('fps'),
};

let poseLandmarker;
let drawingUtils;
let audioCtx;
let lastVideoTime = -1;
let lastDingBand = 0;
let smoothedBadness = 0;
let lastFrameAt = performance.now();
let lastPoseAt = 0;
let lastGoodScores = { neck: 0, slouch: 0, badness: 0 };
let consecutiveMisses = 0;
let loopStarted = false;

const won = new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 });
const clamp = (n, min = 0, max = 1) => Math.min(max, Math.max(min, n));
const lerp = (a, b, t) => a + (b - a) * t;

function money(level, base, spread) {
  const fearTax = 1 + Math.pow(level, 1.7) * 2.2;
  return Math.round((base + spread * level) * fearTax / 10000) * 10000;
}

function ensureAudio() {
  audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playCashRegister(level = 0.5) {
  ensureAudio();
  const now = audioCtx.currentTime;
  const master = audioCtx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.22 + level * 0.14, now + 0.015);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
  master.connect(audioCtx.destination);

  // drawer thump
  const thump = audioCtx.createOscillator();
  thump.type = 'triangle';
  thump.frequency.setValueAtTime(92, now);
  thump.frequency.exponentialRampToValueAtTime(43, now + 0.13);
  thump.connect(master);
  thump.start(now);
  thump.stop(now + 0.15);

  // coin/chime cluster
  [0.06, 0.11, 0.17, 0.25].forEach((offset, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = i % 2 ? 'square' : 'sine';
    osc.frequency.setValueAtTime([987, 1318, 1568, 2093][i], now + offset);
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.13, now + offset + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.14);
    osc.connect(gain).connect(master);
    osc.start(now + offset);
    osc.stop(now + offset + 0.16);
  });
}

function setStatus(level) {
  els.statusDot.className = 'dot';
  if (level < 0.22) {
    els.statusDot.classList.add('idle');
    els.postureLabel.textContent = '지갑 안전권';
    els.postureHint.textContent = '지금 자세는 화면을 살려두는 중.';
    els.billMessage.textContent = '아직 지갑은 안전합니다.';
  } else if (level < 0.55) {
    els.statusDot.classList.add('warn');
    els.postureLabel.textContent = '거북목 경고';
    els.postureHint.textContent = '고개가 앞으로 나오고 어깨가 말리는 중.';
    els.billMessage.textContent = '돈통이 살짝 열렸습니다. 자세 펴면 닫힙니다.';
  } else {
    els.statusDot.classList.add('bad');
    els.postureLabel.textContent = '디스크 청구서 발행 중';
    els.postureHint.textContent = '화면이 흐릴수록 자세 공포값이 올라갑니다.';
    els.billMessage.textContent = '따르릉. 병원비 밈 각도 나왔습니다.';
  }
}

function updateBill(level, neck, slouch) {
  const neckCost = money(neck, 1_800_000, 7_200_000);
  const backCost = money(slouch, 2_400_000, 9_600_000);
  const therapy = money(level, 90_000, 980_000);
  const total = neckCost + backCost + therapy;
  els.billLevel.textContent = `${Math.round(level * 100)}%`;
  els.neckCost.textContent = won.format(neckCost);
  els.backCost.textContent = won.format(backCost);
  els.therapyCost.textContent = won.format(therapy);
  els.totalCost.textContent = won.format(total);

  const band = Math.floor(level * 5);
  if (band > lastDingBand && level > 0.24) {
    playCashRegister(level);
    els.bill.classList.add('ding');
    setTimeout(() => els.bill.classList.remove('ding'), 230);
  }
  lastDingBand = band;
}

function estimatePosture(landmarks) {
  const L = PoseLandmarker.POSE_LANDMARKS;
  const leftEar = landmarks[L.LEFT_EAR];
  const rightEar = landmarks[L.RIGHT_EAR];
  const leftShoulder = landmarks[L.LEFT_SHOULDER];
  const rightShoulder = landmarks[L.RIGHT_SHOULDER];
  const leftHip = landmarks[L.LEFT_HIP];
  const rightHip = landmarks[L.RIGHT_HIP];

  // 웹캠 상반신만 잡힐 때 한쪽 귀/엉덩이 landmark가 자주 튄다.
  // visible point만 평균내고, 엉덩이가 안 보이면 어깨 기준 fallback을 써서 감지가 끊기지 않게 한다.
  const ear = avgVisiblePoint(leftEar, rightEar) ?? avgPoint(leftEar, rightEar);
  const shoulder = avgVisiblePoint(leftShoulder, rightShoulder) ?? avgPoint(leftShoulder, rightShoulder);
  const hip = avgVisiblePoint(leftHip, rightHip);
  const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x) || 0.22;

  // Mirrored camera makes left/right irrelevant; absolute horizontal head offset catches forward/side protrusion.
  const headOffset = Math.abs(ear.x - shoulder.x) / shoulderWidth;
  const headDrop = (ear.y - shoulder.y + 0.18) / 0.22; // ear should sit clearly above shoulder.
  const neck = clamp((headOffset - 0.16) / 0.34 * 0.75 + clamp(headDrop, 0, 1) * 0.35);

  const torsoDx = hip ? Math.abs(shoulder.x - hip.x) : headOffset * 0.55;
  const torsoDy = hip ? Math.max(0.001, hip.y - shoulder.y) : 0.28;
  const torsoLean = torsoDx / torsoDy;
  const compressedTorso = hip ? clamp((0.33 - torsoDy) / 0.18) : clamp((headDrop - 0.18) / 0.6) * 0.55;
  const shoulderTilt = Math.abs(leftShoulder.y - rightShoulder.y) / shoulderWidth;
  const slouch = clamp((torsoLean - 0.08) / 0.32 * 0.45 + compressedTorso * 0.42 + clamp((shoulderTilt - 0.05) / 0.28) * 0.25);

  return { neck, slouch, badness: clamp(neck * 0.55 + slouch * 0.55) };
}

function avgPoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z ?? 0) + (b.z ?? 0)) / 2 };
}

function visibleEnough(point) {
  return point && (point.visibility == null || point.visibility > 0.28);
}

function avgVisiblePoint(a, b) {
  const points = [a, b].filter(visibleEnough);
  if (!points.length) return null;
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    z: points.reduce((sum, point) => sum + (point.z ?? 0), 0) / points.length,
  };
}

async function initPose() {
  if (poseLandmarker) return;
  els.postureLabel.textContent = 'AI 자세 모델 로딩 중';
  const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm');
  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
      // Chrome/Windows 일부 환경에서 GPU delegate가 몇 프레임 뒤 멈칫하는 경우가 있어
      // 바이럴 데모는 CPU가 더 안정적이다. 속도보다 감지 지속성을 우선한다.
      delegate: 'CPU',
    },
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: 0.25,
    minPosePresenceConfidence: 0.25,
    minTrackingConfidence: 0.25,
  });
  drawingUtils = new DrawingUtils(els.canvas.getContext('2d'));
}

async function startCamera() {
  els.startBtn.disabled = true;
  els.startBtn.textContent = '시작 중...';
  try {
    await initPose();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    els.video.srcObject = stream;
    await els.video.play();
    ensureAudio();
    els.startBtn.textContent = '실시간 감지 중';
    if (!loopStarted) {
      loopStarted = true;
      requestAnimationFrame(loop);
    }
  } catch (err) {
    console.error(err);
    els.startBtn.disabled = false;
    els.startBtn.textContent = '웹캠 시작';
    els.postureLabel.textContent = '웹캠/모델 오류';
    els.postureHint.textContent = err?.message || '브라우저 권한 또는 네트워크를 확인하세요.';
  }
}

function loop() {
  const now = performance.now();
  const dt = now - lastFrameAt;
  lastFrameAt = now;
  els.fps.textContent = Math.round(1000 / Math.max(1, dt));

  if (els.video.currentTime !== lastVideoTime && poseLandmarker) {
    lastVideoTime = els.video.currentTime;
    try {
      const result = poseLandmarker.detectForVideo(els.video, now);
      drawAndScore(result, now);
    } catch (err) {
      console.warn('pose detection skipped one frame', err);
    }
  }
  requestAnimationFrame(loop);
}

function drawAndScore(result, now) {
  const canvas = els.canvas;
  const rect = els.stage.getBoundingClientRect();
  const nextWidth = Math.round(rect.width * devicePixelRatio);
  const nextHeight = Math.round(rect.height * devicePixelRatio);
  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth;
    canvas.height = nextHeight;
  }
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(canvas.width, canvas.height);
  ctx.clearRect(0, 0, 1, 1);
  ctx.restore();

  if (!result.landmarks?.length) {
    consecutiveMisses += 1;
    const recentlyHadPose = now - lastPoseAt < 900;
    if (recentlyHadPose) {
      // 한두 프레임 포즈가 빠져도 바로 감지를 꺼버리지 말고 마지막 값을 천천히 감쇠.
      smoothedBadness = lerp(smoothedBadness, lastGoodScores.badness, 0.05);
      renderScores(lastGoodScores.neck, lastGoodScores.slouch, smoothedBadness, true, true);
    } else {
      smoothedBadness = lerp(smoothedBadness, 0, 0.04);
      renderScores(0, 0, smoothedBadness, false);
    }
    return;
  }

  consecutiveMisses = 0;
  lastPoseAt = now;

  const landmarks = result.landmarks[0];
  drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, { color: 'rgba(248,214,96,.8)', lineWidth: 3 });
  drawingUtils.drawLandmarks(landmarks, { color: '#ff3b5c', radius: 3 });

  const score = estimatePosture(landmarks);
  lastGoodScores = score;
  smoothedBadness = lerp(smoothedBadness, score.badness, 0.14);
  renderScores(score.neck, score.slouch, smoothedBadness, true);
}

function renderScores(neck, slouch, level, hasPose, isHolding = false) {
  const blur = Math.round(lerp(0, 18, Math.pow(level, 1.25)) * 10) / 10;
  els.fog.style.setProperty('--blur', `${blur}px`);
  els.fog.style.setProperty('--fogA', `${0.05 + level * 0.22}`);
  els.fog.style.setProperty('--fogB', `${level * 0.42}`);
  els.neckScore.textContent = hasPose ? Math.round(neck * 100) : '-';
  els.slouchScore.textContent = hasPose ? Math.round(slouch * 100) : '-';
  els.blurScore.textContent = `${blur}px`;
  if (!hasPose) {
    els.postureLabel.textContent = '사람을 못 찾음';
    els.postureHint.textContent = '상반신과 얼굴/어깨가 화면 안에 들어오게 해주세요.';
  } else if (isHolding) {
    els.postureLabel.textContent = '감지 유지 중';
    els.postureHint.textContent = `포즈가 ${consecutiveMisses}프레임 흔들려서 마지막 값을 유지합니다.`;
  } else {
    setStatus(level);
  }
  updateBill(level, neck, slouch);
}

els.startBtn.addEventListener('click', startCamera);
els.soundBtn.addEventListener('click', () => playCashRegister(0.8));
