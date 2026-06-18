# Posture Debt Cam

웹캠으로 사용자의 자세를 추정해서 거북목/구부정 지수가 올라갈수록 화면을 뿌옇게 만들고, 우측 하단에 가상의 목/허리 디스크 수술비 청구서를 띄우는 바이럴 macOS/웹 데모입니다.

> 의료 진단용이 아닙니다. MediaPipe 2D pose landmark 기반의 교육/엔터테인먼트용 휴리스틱 데모입니다.

## 판매 포지션

- 가격대: USD $3-5 권장
- 한 줄 카피: `Your posture gets worse. Your screen gets foggier. Your fake hospital bill gets louder.`
- 타깃: 재택근무자, 개발자, 학생, 밈/바이럴 콘텐츠 제작자
- 판매처 후보: Gumroad, Lemon Squeezy, itch.io, 개인 랜딩페이지

## 기능

- 웹캠 실시간 자세 감지
- 거북목 지수 / 구부정 지수 계산
- 자세가 나빠질수록 화면 blur/fog 증가
- 우측 하단 가상 수술비 청구서
- 단계 상승 시 돈통/동전 느낌 WebAudio 효과음
- macOS 카메라 권한 문구 포함
- macOS `.dmg` / `.zip` 빌드 설정 포함
- GitHub Actions에서 macOS 빌드 아티팩트 자동 생성

## 로컬 웹 실행

```bash
python -m http.server 8765
```

브라우저에서 열기:

```text
http://127.0.0.1:8765
```

웹캠 권한을 허용해야 동작합니다.

## 데스크톱 앱 실행

```bash
npm install
npm start
```

## macOS 앱 빌드

macOS 또는 GitHub Actions macOS runner에서:

```bash
npm ci
npm run smoke
npm run dist:mac
```

결과물:

```text
dist/Posture Debt Cam-0.2.0-mac-*.dmg
dist/Posture Debt Cam-0.2.0-mac-*.zip
```

## GitHub Actions 빌드

`main`에 push하면 `.github/workflows/build-macos.yml`이 macOS 빌드를 실행하고 DMG/ZIP을 artifact로 올립니다.

현재 설정은 **unsigned build**입니다. 실제 유료 판매에서 Gatekeeper 경고를 줄이려면 Apple Developer 계정으로 Developer ID 서명과 notarization을 추가해야 합니다.

필요한 Apple 배포 단계:

1. Apple Developer Program 가입
2. Developer ID Application 인증서 생성
3. electron-builder signing 환경변수 설정
4. Apple notarization 설정
5. DMG 다운로드/설치 실기기 테스트

## 파일

```text
index.html                 # 앱 UI
electron/main.cjs          # macOS/Electron shell
styles.css                 # 화면/영수증/흐림 효과
app.js                     # MediaPipe 자세 감지 및 비용 연출
package.json               # Electron/electron-builder 설정
build/entitlements.mac.plist
.github/workflows/build-macos.yml
scripts/smoke.mjs
```

## 주의/면책

Posture Debt Cam은 의료기기, 진단 도구, 치료 조언 도구가 아닙니다. 수술비 청구서는 바이럴 연출을 위한 가상의 과장값입니다. 실제 통증이나 신경 증상이 있으면 의료 전문가에게 상담해야 합니다.
