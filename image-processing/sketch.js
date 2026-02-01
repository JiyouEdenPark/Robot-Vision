/**
 * 웹캠 + 픽셀 조작: 엣지 검출(Sobel) + 움직이는 픽셀 잔상
 */

let capture;
let edgeImg;      // 현재 프레임 엣지 결과
let edgeDisplay; // 움직인 엣지=다른 색, 정지 엣지=흰색
let trailBuffer; // 잔상 누적 버퍼
let prevPixels;  // 이전 프레임 픽셀 (움직임 감지용)
let prevTrailBuffer; // 이전 프레임 잔상 버퍼 (변화량 측정용)
let w, h;
let scaleFactor = 0.5; // 해상도 낮추면 더 빠름
const TRAIL_FADE = 0.98; // 1에 가까울수록 잔상 오래 남음
const EDGE_THRESHOLD = 70; // 이 값 이상인 엣지만 남김
const MOTION_THRESHOLD = 30; // 픽셀 차이 이하면 정지로 봄
const MOTION_MAX = 180;      // 이 이상이면 최고속(빨강), 그 사이는 느리면 초록→빨강

// Sobel 커널
const sobelX = [
  [-1, 0, 1],
  [-2, 0, 2],
  [-1, 0, 1]
];
const sobelY = [
  [-1, -2, -1],
  [0, 0, 0],
  [1, 2, 1]
];

function setup() {
  createCanvas(1200, 800); // 6:4 비율
  w = width;
  h = height;

  capture = createCapture(VIDEO);
  capture.size(w, h);
  capture.hide();

  edgeImg = createImage(w, h);
  edgeImg.pixelDensity(1);
  edgeDisplay = createImage(w, h);
  edgeDisplay.pixelDensity(1);
  trailBuffer = createGraphics(w, h);
  trailBuffer.pixelDensity(1);
  trailBuffer.background(0);
  prevTrailBuffer = createGraphics(w, h);
  prevTrailBuffer.pixelDensity(1);
  prevTrailBuffer.background(0);
  prevPixels = null;
}

function draw() {
  if (!capture.loadedmetadata) return;

  capture.loadPixels();
  if (!capture.pixels.length) return;

  // 1) 엣지 검출 (Sobel, 픽셀 단위)
  edgeImg.loadPixels();
  const d = capture.pixels;
  const out = edgeImg.pixels;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let gx = 0, gy = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = 4 * ((y + ky) * w + (x + kx));
          const gray = 0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2];
          gx += gray * sobelX[ky + 1][kx + 1];
          gy += gray * sobelY[ky + 1][kx + 1];
        }
      }
      let mag = min(255, sqrt(gx * gx + gy * gy) * 1.2);
      if (mag < EDGE_THRESHOLD) mag = 0; // 큰 엣지만 남김
      const outIdx = 4 * (y * w + x);
      out[outIdx] = out[outIdx + 1] = out[outIdx + 2] = mag;
      out[outIdx + 3] = 255;
    }
  }
  edgeImg.updatePixels();

  // 2) 움직임 감지 → 속도에 따라 느리면 초록, 빠르면 빨강, 정지면 흰색
  edgeDisplay.loadPixels();
  const disp = edgeDisplay.pixels;
  const len = w * h * 4;
  for (let i = 0; i < len; i += 4) {
    const edgeVal = out[i];
    if (edgeVal < EDGE_THRESHOLD) {
      disp[i] = disp[i + 1] = disp[i + 2] = 0;
      disp[i + 3] = 0;
      continue;
    }
    let motion = 0;
    if (prevPixels && prevPixels.length === len) {
      motion = abs(d[i] - prevPixels[i]) + abs(d[i + 1] - prevPixels[i + 1]) + abs(d[i + 2] - prevPixels[i + 2]);
    }
    if (motion > MOTION_THRESHOLD) {
      // t: 0 = 느림(초록), 1 = 빠름(빨강)
      const t = min(1, (motion - MOTION_THRESHOLD) / (MOTION_MAX - MOTION_THRESHOLD));
      disp[i] = 255 * t;           // R
      disp[i + 1] = 255 * (1 - t); // G
      disp[i + 2] = 0;             // B
      disp[i + 3] = 220;
    } else {
      disp[i] = disp[i + 1] = disp[i + 2] = 255; disp[i + 3] = 200; // 정지 엣지: 흰색
    }
  }
  edgeDisplay.updatePixels();
  prevPixels = d.slice();

  // 3) 잔상 버퍼: 픽셀 단위로 감쇠 후 현재 엣지와 max (누적)
  // 이전 잔상 버퍼 저장 (변화량 측정용)
  prevTrailBuffer.loadPixels();
  const prevTrail = prevTrailBuffer.pixels;
  trailBuffer.loadPixels();
  const trail = trailBuffer.pixels;
  for (let i = 0; i < len; i += 4) {
    const faded = trail[i] * TRAIL_FADE;
    const edgeVal = out[i];
    const v = max(faded, edgeVal);
    trail[i] = trail[i + 1] = trail[i + 2] = v;
    trail[i + 3] = 255;
    // 이전 버퍼에도 복사
    prevTrail[i] = prevTrail[i + 1] = prevTrail[i + 2] = trail[i];
    prevTrail[i + 3] = 255;
  }
  trailBuffer.updatePixels();
  prevTrailBuffer.updatePixels();

  // 4) 화면 그리기: 잔상(회색) → 그 위에 현재 엣지 (움직인=녹색, 정지=흰색)
  image(trailBuffer, 0, 0);
  image(edgeDisplay, 0, 0);

  // 5) HUD: 잔상 정도 및 빨간색/초록색 통계
  drawHUD(disp, len);
}

function drawHUD(edgePixels, pixelCount) {
  // 통계 계산
  let redCount = 0;
  let greenCount = 0;
  let totalEdgePixels = 0;

  // 잔상 관련 통계
  let trailBrightness = 0;
  let trailPixelCount = 0;
  let trailChange = 0; // 잔상 변화량
  let trailVariance = 0; // 잔상 분산 (다양성)
  let newTrailAmount = 0; // 새로운 잔상 추가량
  let trailValues = []; // 분산 계산용

  trailBuffer.loadPixels();
  const trailPixels = trailBuffer.pixels;
  prevTrailBuffer.loadPixels();
  const prevTrailPixels = prevTrailBuffer.pixels;

  for (let i = 0; i < pixelCount; i += 4) {
    const r = edgePixels[i];
    const g = edgePixels[i + 1];
    const b = edgePixels[i + 2];
    const a = edgePixels[i + 3];

    if (a > 0) { // 엣지 픽셀인 경우
      totalEdgePixels++;
      // 빨간색이 더 강한 경우 (빠른 움직임)
      if (r > g && r > 100) {
        redCount++;
      }
      // 초록색이 더 강한 경우 (느린 움직임)
      else if (g > r && g > 100) {
        greenCount++;
      }
    }

    // 잔상 분석
    const trailVal = trailPixels[i];
    const prevTrailVal = prevTrailPixels[i];

    if (trailVal > 10) {
      trailBrightness += trailVal;
      trailPixelCount++;
      trailValues.push(trailVal);

      // 변화량 측정 (이전 프레임과의 차이)
      const change = abs(trailVal - prevTrailVal);
      trailChange += change;

      // 새로운 잔상 추가량 (이전에는 없었는데 지금 생긴 경우)
      if (prevTrailVal < 20 && trailVal > 50) {
        newTrailAmount += trailVal;
      }
    }
  }

  // 평균과 분산 계산
  const avgTrailBrightness = trailPixelCount > 0 ? (trailBrightness / trailPixelCount) : 0;
  let variance = 0;
  if (trailPixelCount > 0) {
    for (let val of trailValues) {
      variance += (val - avgTrailBrightness) * (val - avgTrailBrightness);
    }
    variance = variance / trailPixelCount;
    trailVariance = sqrt(variance); // 표준편차
  }

  // 평균 변화량
  const avgTrailChange = trailPixelCount > 0 ? (trailChange / trailPixelCount) : 0;

  // 동적 trail intensity 계산 (여러 요소 결합)
  const brightnessFactor = (avgTrailBrightness / 255) * 40; // 최대 40%
  const changeFactor = min(30, (avgTrailChange / 50) * 30); // 변화량 기여 (최대 30%)
  const varianceFactor = min(20, (trailVariance / 100) * 20); // 다양성 기여 (최대 20%)
  const newTrailFactor = min(10, (newTrailAmount / 10000) * 10); // 새로운 잔상 기여 (최대 10%)

  // 움직임과 연동 (빨간색/초록색 픽셀 비율 반영)
  const motionFactor = (redCount + greenCount) / max(1, totalEdgePixels) * 10; // 최대 10%

  const trailIntensity = min(100, brightnessFactor + changeFactor + varianceFactor + newTrailFactor + motionFactor);

  const totalPixels = pixelCount / 4;
  const redPercent = totalEdgePixels > 0 ? (redCount / totalEdgePixels * 100) : 0;
  const greenPercent = totalEdgePixels > 0 ? (greenCount / totalEdgePixels * 100) : 0;

  // HUD 배경 (반투명)
  push();
  fill(0, 0, 0, 180);
  noStroke();
  rect(10, 10, 320, 160, 8);

  // HUD 텍스트 스타일
  fill(255);
  textSize(14);
  textAlign(LEFT, TOP);
  textStyle(BOLD);

  // 제목
  fill(255, 255, 0);
  text("SYSTEM STATUS", 20, 20);

  // 빨간색 정보 (빠른 움직임)
  fill(255, 100, 100);
  textSize(12);
  text(`FAST MOTION (RED)`, 20, 50);
  fill(255);
  textSize(11);
  text(`${redCount.toLocaleString()} pixels (${redPercent.toFixed(1)}%)`, 20, 68);

  // 빨간색 게이지 바
  fill(50, 0, 0);
  rect(20, 85, 280, 12, 2);
  fill(255, 50, 50);
  rect(20, 85, 280 * (redPercent / 100), 12, 2);

  // 초록색 정보 (느린 움직임)
  fill(100, 255, 100);
  textSize(12);
  text(`SLOW MOTION (GREEN)`, 20, 105);
  fill(255);
  textSize(11);
  text(`${greenCount.toLocaleString()} pixels (${greenPercent.toFixed(1)}%)`, 20, 123);

  // 초록색 게이지 바
  fill(0, 50, 0);
  rect(20, 140, 280, 12, 2);
  fill(50, 255, 50);
  rect(20, 140, 280 * (greenPercent / 100), 12, 2);

  pop();
}
