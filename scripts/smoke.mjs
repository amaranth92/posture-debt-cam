import { readFileSync, existsSync } from 'node:fs';

const requiredFiles = [
  'index.html',
  'styles.css',
  'app.js',
  'electron/main.cjs',
  'build/entitlements.mac.plist',
  'build/icon.icns',
  'build/icon.png',
  'package.json',
];

for (const file of requiredFiles) {
  if (!existsSync(file)) throw new Error(`Missing required file: ${file}`);
}

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
if (packageJson.main !== 'electron/main.cjs') throw new Error('Electron main entry is wrong');
if (!packageJson.build?.mac?.extendInfo?.NSCameraUsageDescription) {
  throw new Error('macOS camera usage description is missing');
}
if (!packageJson.build?.mac?.entitlements) throw new Error('macOS entitlements are missing');

const app = readFileSync('app.js', 'utf8');
const checks = [
  'PoseLandmarker',
  "delegate: 'CPU'",
  'lastGoodScores',
  '감지 유지 중',
  'NSCameraUsageDescription',
];
for (const text of checks.slice(0, 4)) {
  if (!app.includes(text)) throw new Error(`app.js missing stability/safety marker: ${text}`);
}

const main = readFileSync('electron/main.cjs', 'utf8');
for (const text of ['setPermissionRequestHandler', "permission === 'media'", 'Not medical advice']) {
  if (!main.includes(text)) throw new Error(`electron/main.cjs missing marker: ${text}`);
}

console.log('Smoke checks passed: Electron shell, macOS camera permissions, and posture stability markers are present.');
