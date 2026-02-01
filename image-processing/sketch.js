/**
 * 웹캠 + 픽셀 조작: 엣지 검출(Sobel) + 움직이는 픽셀 잔상
 */

let capture;
let edgeImg;      // 현재 프레임 엣지 결과
let edgeDisplay; // 움직인 엣지=다른 색, 정지 엣지=흰색
let trailBuffer; // 잔상 누적 버퍼
let prevPixels;  // 이전 프레임 픽셀 (움직임 감지용)
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
  trailBuffer.loadPixels();
  const trail = trailBuffer.pixels;
  for (let i = 0; i < len; i += 4) {
    const faded = trail[i] * TRAIL_FADE;
    const edgeVal = out[i];
    const v = max(faded, edgeVal);
    trail[i] = trail[i + 1] = trail[i + 2] = v;
    trail[i + 3] = 255;
  }
  trailBuffer.updatePixels();

  // 4) 화면 그리기: 잔상(회색) → 그 위에 현재 엣지 (움직인=녹색, 정지=흰색)
  image(trailBuffer, 0, 0);
  image(edgeDisplay, 0, 0);
}
