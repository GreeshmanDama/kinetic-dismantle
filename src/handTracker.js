/**
 * Restart-safe MediaPipe Hands tracker with two-hand zoom support.
 * Owns its webcam stream and animation loop. A new MediaPipe instance is
 * created for every camera session so stopping/restarting cannot reuse stale
 * Camera/Hands state.
 *
 * Two-hand behaviour:
 *  - While two hands are visible, openness/rotation targets are FROZEN, so
 *    the model keeps its current dismantled/assembled state while zooming.
 *  - The distance between the palms is reported in `twoHand.distance`.
 *  - If one hand drops out for a moment (very common), the zoom gesture and
 *    the frozen state are held for `twoHandHoldMs` so the model never
 *    collapses by accident.
 */

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17]
];

const FINGERTIP_INDICES = [4, 8, 12, 16, 20];
const MCP_INDICES = [2, 5, 9, 13, 17];
const PALM_INDICES = [0, 5, 9, 13, 17];

export class HandTracker {
  constructor(videoElement, canvasElement, options = {}) {
    this.video = videoElement;
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d', { alpha: true });
    this.onUpdate = options.onUpdate || null;
    this.onStatus = options.onStatus || null;

    this.hands = null;
    this.stream = null;
    this.trackEndHandlers = new Map();
    this.isRunning = false;
    this.startPromise = null;
    this.stopPromise = null;
    this.generation = 0;
    this.rafId = null;
    this.processingFrame = false;
    this.lastVideoTime = -1;
    this.lastSentAt = 0;
    this.targetFrameInterval = 1000 / 30;

    this.smoothOpenness = 0;
    this.targetOpenness = 0;
    this.smoothingAlpha = 0.18;
    this.isHandPresent = false;
    this.fps = 0;
    this.frameCount = 0;
    this.lastFpsUpdate = performance.now();

    this.targetRoll = 0;
    this.smoothRoll = 0;
    this.targetYaw = 0;
    this.smoothYaw = 0;
    this.targetLateralX = 0;
    this.smoothLateralX = 0;
    this.pulse = 0;

    // Two-hand zoom
    this.twoHandHoldMs = options.twoHandHoldMs ?? 500;
    this.zoomSmoothing = options.zoomSmoothing ?? 0.35; // EMA factor per detection frame
    this.lastTwoHandAt = -Infinity;
    this.zoomDistance = null;
    this.lastFingersOpen = 0;
    this.lastPalmScale = '--';

    this.video.muted = true;
    this.video.playsInline = true;
    this.video.autoplay = true;
  }

  /** True while a two-hand zoom gesture is active (including the short dropout hold). */
  get isTwoHands() {
    return (
      this.isRunning &&
      this.zoomDistance !== null &&
      performance.now() - this.lastTwoHandAt < this.twoHandHoldMs
    );
  }

  async start() {
    if (this.isRunning) return true;
    if (this.stopPromise) await this.stopPromise;
    if (this.startPromise) return this.startPromise;

    const token = ++this.generation;
    this.startPromise = this.startSession(token);
    try {
      return await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  async startSession(token) {
    let acquiredStream = null;
    let handsInstance = null;

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access is unavailable. Use localhost or HTTPS and a supported browser.');
      }
      if (!window.Hands) {
        throw new Error('MediaPipe Hands did not load. Check your internet connection and refresh the page.');
      }

      this.resetMetrics();
      this.reportStatus('connecting');

      acquiredStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'user' },
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30, max: 30 }
        }
      });

      // A stop may have been requested while the permission prompt was open.
      if (token !== this.generation) {
        acquiredStream.getTracks().forEach(track => track.stop());
        return false;
      }

      this.stream = acquiredStream;
      acquiredStream.getTracks().forEach(track => {
        const onEnded = () => {
          if (token !== this.generation || !this.isRunning) return;
          this.stop().then(() => {
            this.reportStatus('error', new Error('The webcam stream ended. Check the camera connection and try again.'));
          });
        };
        this.trackEndHandlers.set(track, onEnded);
        track.addEventListener('ended', onEnded, { once: true });
      });
      this.video.srcObject = acquiredStream;
      await this.video.play();
      await this.waitForVideoFrame(token);

      if (token !== this.generation) {
        acquiredStream.getTracks().forEach(track => track.stop());
        if (this.stream === acquiredStream) this.stream = null;
        return false;
      }

      this.canvas.width = this.video.videoWidth || 640;
      this.canvas.height = this.video.videoHeight || 480;

      handsInstance = new window.Hands({
        locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      });
      this.hands = handsInstance;

      await handsInstance.setOptions({
        maxNumHands: 2, // two hands are required for the zoom gesture
        modelComplexity: 1,
        minDetectionConfidence: 0.62,
        minTrackingConfidence: 0.58
      });

      handsInstance.onResults(results => {
        if (token === this.generation && this.isRunning) {
          this.processResults(results);
        }
      });

      // Set running before starting the frame loop so the first result is not dropped.
      this.isRunning = true;
      this.reportStatus('online');
      this.scheduleFrame(token);
      return true;
    } catch (error) {
      if (token === this.generation) {
        this.isRunning = false;
        if (this.stream) {
          this.stopStream(this.stream);
          this.stream = null;
        } else if (acquiredStream) {
          this.stopStream(acquiredStream);
        }
        this.video.pause();
        this.video.srcObject = null;
        this.hands = null;
        if (handsInstance?.close) {
          try { await handsInstance.close(); } catch { /* already disposed */ }
        }
        this.clearCanvas();
        this.reportStatus('error', error);
      }
      throw error;
    }
  }

  waitForVideoFrame(token) {
    if (this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && this.video.videoWidth > 0) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.video.removeEventListener('loadeddata', onReady);
        this.video.removeEventListener('error', onError);
        clearTimeout(timeoutId);
      };
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error('The webcam stream started, but no video frames were received.'));
      };
      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('Timed out waiting for the webcam video. Check camera permission and device availability.'));
      }, 10000);

      this.video.addEventListener('loadeddata', onReady, { once: true });
      this.video.addEventListener('error', onError, { once: true });
      if (token !== this.generation) {
        cleanup();
        resolve();
      }
    });
  }

  scheduleFrame(token) {
    if (!this.isRunning || token !== this.generation) return;
    this.rafId = requestAnimationFrame(() => this.frameLoop(token));
  }

  async frameLoop(token) {
    if (!this.isRunning || token !== this.generation) return;

    const now = performance.now();
    const hasNewFrame = this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      && this.video.videoWidth > 0
      && this.video.currentTime !== this.lastVideoTime;

    if (hasNewFrame && !this.processingFrame && now - this.lastSentAt >= this.targetFrameInterval && this.hands) {
      this.processingFrame = true;
      this.lastVideoTime = this.video.currentTime;
      this.lastSentAt = now;
      try {
        await this.hands.send({ image: this.video });
      } catch (error) {
        if (token === this.generation && this.isRunning) {
          console.warn('MediaPipe frame processing failed:', error);
        }
      } finally {
        this.processingFrame = false;
      }
    }

    this.scheduleFrame(token);
  }

  stopStream(stream) {
    stream?.getTracks().forEach(track => {
      const onEnded = this.trackEndHandlers.get(track);
      if (onEnded) track.removeEventListener('ended', onEnded);
      this.trackEndHandlers.delete(track);
      try { track.stop(); } catch { /* track already stopped */ }
    });
  }

  async stop() {
    if (this.stopPromise) return this.stopPromise;

    // Invalidate callbacks and pending getUserMedia requests immediately.
    ++this.generation;
    this.isRunning = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;

    const stream = this.stream;
    const hands = this.hands;
    this.stream = null;
    this.hands = null;

    this.stopPromise = (async () => {
      if (stream) this.stopStream(stream);

      this.video.pause();
      this.video.srcObject = null;
      this.processingFrame = false;
      this.lastVideoTime = -1;
      this.resetMetrics();
      this.clearCanvas();

      if (hands?.close) {
        try { await hands.close(); } catch (error) {
          console.debug('MediaPipe cleanup completed with a warning:', error);
        }
      }

      this.reportStatus('offline');
      this.emitNoHand();
    })();

    try {
      await this.stopPromise;
    } finally {
      this.stopPromise = null;
    }
  }

  resetMetrics() {
    this.smoothOpenness = 0;
    this.targetOpenness = 0;
    this.isHandPresent = false;
    this.fps = 0;
    this.frameCount = 0;
    this.lastFpsUpdate = performance.now();
    this.targetRoll = 0;
    this.smoothRoll = 0;
    this.targetYaw = 0;
    this.smoothYaw = 0;
    this.targetLateralX = 0;
    this.smoothLateralX = 0;
    this.pulse = 0;
    this.lastTwoHandAt = -Infinity;
    this.zoomDistance = null;
    this.lastFingersOpen = 0;
    this.lastPalmScale = '--';
  }

  reportStatus(status, error = null) {
    if (this.onStatus) this.onStatus({ status, error });
  }

  emitNoHand() {
    if (this.onUpdate) {
      this.onUpdate({
        isDetected: false,
        handsCount: 0,
        rawOpenness: 0,
        fingersCount: 0,
        palmScale: '--',
        gestureText: 'NO HAND',
        fps: 0,
        landmarks: null,
        twoHand: { active: false, distance: null }
      });
    }
  }

  clearCanvas() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  dist(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const dz = (p1.z || 0) - (p2.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  palmCenter(landmarks) {
    let x = 0;
    let y = 0;
    PALM_INDICES.forEach(index => {
      x += landmarks[index].x;
      y += landmarks[index].y;
    });
    return { x: x / PALM_INDICES.length, y: y / PALM_INDICES.length };
  }

  heldRotationPayload() {
    return {
      roll: this.targetRoll,
      yaw: this.targetYaw,
      rollDeg: Math.round(this.targetRoll * 180 / Math.PI),
      yawDeg: Math.round(this.targetYaw * 180 / Math.PI)
    };
  }

  processResults(results) {
    if (!this.isRunning) return;

    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsUpdate >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastFpsUpdate = now;
    }

    const width = this.canvas.width;
    const height = this.canvas.height;
    this.ctx.clearRect(0, 0, width, height);
    this.pulse = (this.pulse + 0.08) % (Math.PI * 2);

    const hands = results.multiHandLandmarks || [];

    // ---------------------------------------------------------------- 2 hands
    if (hands.length >= 2) {
      this.processTwoHands(hands, width, height, now);
      return;
    }

    // One hand may briefly vanish in the middle of a zoom; keep the gesture.
    const inZoomHold = now - this.lastTwoHandAt < this.twoHandHoldMs;
    const landmarks = hands[0];

    // ----------------------------------------------------------------- 1 hand
    if (landmarks) {
      const { openness, fingersOpen, palmScale } = this.calculateOpenness(landmarks);
      const rotation = this.calculateHandRotation(landmarks);

      this.isHandPresent = true;
      this.drawHandSkeleton(landmarks, width, height, openness, rotation);

      if (inZoomHold) {
        // Do NOT touch targetOpenness: the model must keep its current state.
        this.emitZoomHold(landmarks);
        return;
      }

      this.zoomDistance = null;
      this.targetOpenness = openness;
      this.targetRoll = rotation.roll;
      this.targetYaw = rotation.yaw;
      this.targetLateralX = rotation.lateralX;
      this.lastFingersOpen = fingersOpen;
      this.lastPalmScale = palmScale.toFixed(2);

      let gesture = 'PARTIAL';
      if (openness > 0.65) gesture = 'OPEN HAND';
      else if (openness < 0.28) gesture = 'CLOSED FIST';

      this.onUpdate?.({
        isDetected: true,
        handsCount: 1,
        rawOpenness: openness,
        fingersCount: fingersOpen,
        palmScale: this.lastPalmScale,
        gestureText: gesture,
        fps: this.fps,
        landmarks,
        rotation: {
          roll: rotation.roll,
          yaw: rotation.yaw,
          rollDeg: Math.round(rotation.roll * 180 / Math.PI),
          yawDeg: Math.round(rotation.yaw * 180 / Math.PI)
        },
        twoHand: { active: false, distance: null }
      });
      return;
    }

    // ---------------------------------------------------------------- no hand
    if (inZoomHold) {
      this.emitZoomHold(null);
      return;
    }

    this.isHandPresent = false;
    this.targetOpenness = 0;
    this.zoomDistance = null;
    this.onUpdate?.({
      isDetected: false,
      handsCount: 0,
      rawOpenness: this.smoothOpenness,
      fingersCount: 0,
      palmScale: '--',
      gestureText: 'NO HAND',
      fps: this.fps,
      landmarks: null,
      twoHand: { active: false, distance: null }
    });
  }

  processTwoHands(hands, width, height, now) {
    this.lastTwoHandAt = now;
    this.isHandPresent = true;

    // Distance between the palms in "image-height" units, so horizontal and
    // vertical movement count equally on a 4:3 / 16:9 camera.
    const a = this.palmCenter(hands[0]);
    const b = this.palmCenter(hands[1]);
    const aspect = width / height;
    const rawDistance = Math.hypot((a.x - b.x) * aspect, a.y - b.y);

    this.zoomDistance = this.zoomDistance === null
      ? rawDistance
      : this.zoomDistance + (rawDistance - this.zoomDistance) * this.zoomSmoothing;

    for (let i = 0; i < 2; i++) {
      const { openness } = this.calculateOpenness(hands[i]);
      this.drawHandSkeleton(hands[i], width, height, openness, this.calculateHandRotation(hands[i]));
    }
    this.drawZoomLink(a, b, width, height);

    // targetOpenness / targetRoll / targetYaw are intentionally left alone.
    this.onUpdate?.({
      isDetected: true,
      handsCount: 2,
      rawOpenness: this.targetOpenness,
      fingersCount: this.lastFingersOpen,
      palmScale: this.lastPalmScale,
      gestureText: 'TWO-HAND ZOOM',
      fps: this.fps,
      landmarks: hands[0],
      allLandmarks: hands,
      rotation: this.heldRotationPayload(),
      twoHand: { active: true, distance: this.zoomDistance }
    });
  }

  emitZoomHold(landmarks) {
    this.onUpdate?.({
      isDetected: !!landmarks,
      handsCount: landmarks ? 1 : 0,
      rawOpenness: this.targetOpenness,
      fingersCount: this.lastFingersOpen,
      palmScale: this.lastPalmScale,
      gestureText: 'TWO-HAND ZOOM',
      fps: this.fps,
      landmarks: landmarks || null,
      rotation: this.heldRotationPayload(),
      // Keep the gesture alive with the last known distance.
      twoHand: { active: this.zoomDistance !== null, distance: this.zoomDistance }
    });
  }

  calculateOpenness(landmarks) {
    const wrist = landmarks[0];
    const middleMCP = landmarks[9];
    const indexMCP = landmarks[5];
    const pinkyMCP = landmarks[17];
    const palmLength = this.dist(wrist, middleMCP);
    const palmWidth = this.dist(indexMCP, pinkyMCP);
    const palmScale = (palmLength + palmWidth) * 0.5 || 0.1;

    let totalDistance = 0;
    let fingersOpen = 0;
    FINGERTIP_INDICES.forEach((tipIndex, index) => {
      const tipDistance = this.dist(wrist, landmarks[tipIndex]) / palmScale;
      const mcpDistance = this.dist(wrist, landmarks[MCP_INDICES[index]]) / palmScale;
      totalDistance += tipDistance;
      if (tipDistance > mcpDistance * 1.35) fingersOpen++;
    });

    const averageDistance = totalDistance / FINGERTIP_INDICES.length;
    const openness = Math.max(0, Math.min(1, (averageDistance - 1.05) / (2.15 - 1.05)));
    return { openness, fingersOpen, palmScale };
  }

  calculateHandRotation(landmarks) {
    const wrist = landmarks[0];
    const middleMCP = landmarks[9];
    const indexMCP = landmarks[5];
    const pinkyMCP = landmarks[17];

    const dx = middleMCP.x - wrist.x;
    const dy = wrist.y - middleMCP.y;
    const roll = Math.atan2(dx, dy);
    const dz = (pinkyMCP.z || 0) - (indexMCP.z || 0);
    const palmWidth = Math.hypot(pinkyMCP.x - indexMCP.x, pinkyMCP.y - indexMCP.y) || 0.1;
    const yaw = Math.atan2(dz * 2.2, palmWidth);
    const lateralX = (((wrist.x + middleMCP.x) * 0.5) - 0.5) * 2;
    return { roll, yaw, lateralX };
  }

  drawZoomLink(a, b, width, height) {
    const ctx = this.ctx;
    const ax = a.x * width;
    const ay = a.y * height;
    const bx = b.x * width;
    const by = b.y * height;
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(85, 232, 255, 0.8)';
    ctx.strokeStyle = 'rgba(85, 232, 255, 0.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(mx, my, 5 + Math.sin(this.pulse) * 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ff6cb7';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  drawHandSkeleton(landmarks, width, height, openness, rotation = { roll: 0, yaw: 0 }) {
    const ctx = this.ctx;

    const red = Math.round(openness * 255);
    const green = Math.round((1 - openness * 0.5) * 240);
    const blue = Math.round(255 - openness * 120);
    const glowColor = `rgb(${red}, ${green}, ${blue})`;

    ctx.save();
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowBlur = 10;
    ctx.shadowColor = `rgba(${red}, ${green}, ${blue}, 0.72)`;

    HAND_CONNECTIONS.forEach(([startIndex, endIndex]) => {
      const start = landmarks[startIndex];
      const end = landmarks[endIndex];
      const gradient = ctx.createLinearGradient(
        start.x * width, start.y * height,
        end.x * width, end.y * height
      );
      gradient.addColorStop(0, '#55e8ff');
      gradient.addColorStop(1, glowColor);
      ctx.strokeStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(start.x * width, start.y * height);
      ctx.lineTo(end.x * width, end.y * height);
      ctx.stroke();
    });

    landmarks.forEach((point, index) => {
      const x = point.x * width;
      const y = point.y * height;
      const isTip = FINGERTIP_INDICES.includes(index);
      const isWrist = index === 0;
      ctx.beginPath();
      if (isTip) {
        ctx.arc(x, y, 5.5 + Math.sin(this.pulse) * 1.2, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ff6cb7';
        ctx.stroke();
      } else {
        ctx.arc(x, y, isWrist ? 6 : 3.2, 0, Math.PI * 2);
        ctx.fillStyle = isWrist ? '#55e8ff' : '#74f6c7';
        ctx.fill();
      }
    });

    const palmCenter = {
      x: ((landmarks[0].x + landmarks[5].x + landmarks[17].x) / 3) * width,
      y: ((landmarks[0].y + landmarks[5].y + landmarks[17].y) / 3) * height
    };
    const radius = 15 + openness * 12 + Math.sin(this.pulse) * 1.5;
    ctx.beginPath();
    ctx.arc(palmCenter.x, palmCenter.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 1.8;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    const pointerLength = radius + 12;
    const pointerX = palmCenter.x + Math.sin(rotation.roll) * pointerLength;
    const pointerY = palmCenter.y - Math.cos(rotation.roll) * pointerLength;
    ctx.beginPath();
    ctx.moveTo(palmCenter.x, palmCenter.y);
    ctx.lineTo(pointerX, pointerY);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(pointerX, pointerY, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#55e8ff';
    ctx.fill();
    ctx.restore();
  }

  getSmoothOpenness(dt = 0.016) {
    const factor = 1 - Math.exp(-this.smoothingAlpha * 60 * dt);
    this.smoothOpenness += (this.targetOpenness - this.smoothOpenness) * factor;
    return this.smoothOpenness;
  }

  getSmoothRotation(dt = 0.016) {
    if (this.isHandPresent) {
      const factor = 1 - Math.exp(-this.smoothingAlpha * 50 * dt);
      this.smoothRoll += (this.targetRoll - this.smoothRoll) * factor;
      this.smoothYaw += (this.targetYaw - this.smoothYaw) * factor;
      this.smoothLateralX += (this.targetLateralX - this.smoothLateralX) * factor;
    }
    return {
      roll: this.smoothRoll,
      yaw: this.smoothYaw,
      lateralX: this.smoothLateralX
    };
  }
}