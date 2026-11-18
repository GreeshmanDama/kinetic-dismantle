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
    this.rightHandLabel = options.rightHandLabel ?? 'Left';
    this.zoomNeedsPinch = options.zoomNeedsPinch ?? true;
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
    this.lastFingersOpen = 0;
    this.lastPalmScale = '--';
    this.twoHandHoldMs = options.twoHandHoldMs ?? 350;
    this.zoomSmoothing = options.zoomSmoothing ?? 0.35;
    this.lastZoomAt = -Infinity;
    this.zoomDistance = null;
    this.pinchOn = options.pinchOn ?? 0.35;
    this.pinchOff = options.pinchOff ?? 0.55;
    this.pinchHoldMs = options.pinchHoldMs ?? 350;
    this.pinchState = { right: false, left: false };
    this.lastRightPinchAt = -Infinity;
    this.handLostHoldMs = options.handLostHoldMs ?? 350;
    this.leftLostHoldMs = options.leftLostHoldMs ?? 200;
    this.lastAnyHandAt = -Infinity;
    this.lastLeftPointer = null;
    this.lastLeftAt = -Infinity;
    this.roleScore = 0;
    this.singleRole = 'right';
    this.lastSingleAt = -Infinity;
    this.lastSingleWrist = null;
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.autoplay = true;
  }

  get isTwoHands() {
    return (
      this.isRunning &&
      this.zoomDistance !== null &&
      performance.now() - this.lastZoomAt < this.twoHandHoldMs
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
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.62,
        minTrackingConfidence: 0.58
      });

      handsInstance.onResults(results => {
        if (token === this.generation && this.isRunning) {
          this.processResults(results);
        }
      });

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
          try { await handsInstance.close(); } catch {}
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
      try { track.stop(); } catch {}
    });
  }

  async stop() {
    if (this.stopPromise) return this.stopPromise;
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
    this.lastFingersOpen = 0;
    this.lastPalmScale = '--';
    this.lastZoomAt = -Infinity;
    this.zoomDistance = null;
    this.pinchState = { right: false, left: false };
    this.lastRightPinchAt = -Infinity;
    this.lastAnyHandAt = -Infinity;
    this.lastLeftPointer = null;
    this.lastLeftAt = -Infinity;
    this.roleScore = 0;
    this.singleRole = 'right';
    this.lastSingleAt = -Infinity;
    this.lastSingleWrist = null;
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
        rightGesture: null,
        leftGesture: null,
        fps: 0,
        landmarks: null,
        pointer: null,
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

  resolveSingleRole(label, now, wrist) {
    const vote = label === undefined ? 0 : (label === this.rightHandLabel ? 1 : -1);
    const jumped = this.lastSingleWrist
      ? Math.hypot(wrist.x - this.lastSingleWrist.x, wrist.y - this.lastSingleWrist.y) > 0.2
      : false;
    this.lastSingleWrist = { x: wrist.x, y: wrist.y };

    if (now - this.lastSingleAt > 500 || jumped) {
      if (vote !== 0) {
        this.roleScore = vote;
        this.singleRole = vote > 0 ? 'right' : 'left';
      }
    } else if (vote !== 0) {
      this.roleScore = this.roleScore * 0.65 + vote * 0.35;
      if (this.singleRole === 'right' && this.roleScore < -0.3) this.singleRole = 'left';
      else if (this.singleRole === 'left' && this.roleScore > 0.3) this.singleRole = 'right';
    }

    this.lastSingleAt = now;
    return this.singleRole;
  }

  buildHands(results, now) {
    const list = results.multiHandLandmarks || [];
    const labels = results.multiHandedness || [];
    const hands = list.slice(0, 2).map((landmarks, i) => ({
      landmarks,
      label: labels[i]?.label,
      role: null
    }));

    if (hands.length === 2) {
      const rightIsSmallerX = this.rightHandLabel === 'Left';
      const [a, b] = hands;
      const aIsRight = rightIsSmallerX
        ? a.landmarks[0].x < b.landmarks[0].x
        : a.landmarks[0].x > b.landmarks[0].x;
      a.role = aIsRight ? 'right' : 'left';
      b.role = aIsRight ? 'left' : 'right';
      this.lastSingleAt = -Infinity;
    } else if (hands.length === 1) {
      hands[0].role = this.resolveSingleRole(hands[0].label, now, hands[0].landmarks[0]);
    }

    hands.forEach(hand => {
      const o = this.calculateOpenness(hand.landmarks);
      hand.openness = o.openness;
      hand.fingersOpen = o.fingersOpen;
      hand.palmScale = o.palmScale;
      hand.rotation = this.calculateHandRotation(hand.landmarks);
      hand.pinch = this.updatePinch(hand.landmarks, o.palmScale, hand.role);
    });

    ['right', 'left'].forEach(role => {
      if (!hands.some(h => h.role === role)) this.pinchState[role] = false;
    });

    return hands;
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

    const hands = this.buildHands(results, now);
    const right = hands.find(h => h.role === 'right');
    const left = hands.find(h => h.role === 'left');

    hands.forEach(hand => {
      this.drawHandSkeleton(hand.landmarks, width, height, hand.openness, hand.rotation, hand.role);
      if (hand.pinch.pinching) this.drawPinchMarker(hand.pinch.x, hand.pinch.y, width, height, hand.role);
    });

    if (hands.length) this.lastAnyHandAt = now;

    const zoomNow = !!(right && left &&
      (this.zoomNeedsPinch ? right.pinch.pinching && left.pinch.pinching : true));

    if (zoomNow) {
      this.lastZoomAt = now;
      this.isHandPresent = true;
      if (this.zoomNeedsPinch) this.lastRightPinchAt = now;

      const a = this.zoomNeedsPinch ? right.pinch : this.palmCenter(right.landmarks);
      const b = this.zoomNeedsPinch ? left.pinch : this.palmCenter(left.landmarks);
      const aspect = width / height;
      const rawDistance = Math.hypot((a.x - b.x) * aspect, a.y - b.y);

      this.zoomDistance = this.zoomDistance === null
        ? rawDistance
        : this.zoomDistance + (rawDistance - this.zoomDistance) * this.zoomSmoothing;

      this.drawZoomLink(a, b, width, height);
      this.emitZoom(hands.length, hands[0].landmarks);
      return;
    }

    const inZoomHold = this.zoomDistance !== null && now - this.lastZoomAt < this.twoHandHoldMs;
    if (inZoomHold) {
      this.isHandPresent = true;
      this.emitZoom(hands.length, hands[0]?.landmarks || null);
      return;
    }
    this.zoomDistance = null;
    this.isHandPresent = hands.length > 0 || now - this.lastAnyHandAt < this.handLostHoldMs;

    if (right) {
      if (right.pinch.pinching) this.lastRightPinchAt = now;
      const pinchHold = now - this.lastRightPinchAt < this.pinchHoldMs;

      if (!pinchHold) {
        this.targetOpenness = right.openness;
        this.targetRoll = right.rotation.roll;
        this.targetYaw = right.rotation.yaw;
        this.targetLateralX = right.rotation.lateralX;
        this.lastFingersOpen = right.fingersOpen;
        this.lastPalmScale = right.palmScale.toFixed(2);
      }
    } else if (hands.length === 0 && now - this.lastAnyHandAt >= this.handLostHoldMs) {
      this.targetOpenness = 0;
    }

    let pointer = null;
    if (left) {
      pointer = { x: left.pinch.x, y: left.pinch.y, pinching: left.pinch.pinching };
      this.lastLeftPointer = pointer;
      this.lastLeftAt = now;
    } else if (this.lastLeftPointer && now - this.lastLeftAt < this.leftLostHoldMs) {
      pointer = this.lastLeftPointer;
    }

    let rightGesture = null;
    if (right) {
      if (right.pinch.pinching) rightGesture = 'PINCH';
      else if (right.openness > 0.65) rightGesture = 'OPEN HAND';
      else if (right.openness < 0.28) rightGesture = 'CLOSED FIST';
      else rightGesture = 'PARTIAL';
    }
    let leftGesture = null;
    if (left) leftGesture = left.pinch.pinching ? 'PINCH GRAB' : 'READY';

    const gestureText = [
      rightGesture ? `R ${rightGesture}` : null,
      leftGesture ? `L ${leftGesture}` : null
    ].filter(Boolean).join(' · ') || 'NO HAND';

    this.onUpdate?.({
      isDetected: hands.length > 0,
      handsCount: hands.length,
      rawOpenness: this.targetOpenness,
      fingersCount: this.lastFingersOpen,
      palmScale: this.lastPalmScale,
      gestureText,
      rightGesture,
      leftGesture,
      fps: this.fps,
      landmarks: (right || left)?.landmarks || null,
      rotation: this.heldRotationPayload(),
      pointer,
      twoHand: { active: false, distance: null }
    });
  }

  emitZoom(handsCount, landmarks) {
    this.onUpdate?.({
      isDetected: handsCount > 0,
      handsCount,
      rawOpenness: this.targetOpenness,
      fingersCount: this.lastFingersOpen,
      palmScale: this.lastPalmScale,
      gestureText: 'TWO-HAND ZOOM',
      rightGesture: null,
      leftGesture: null,
      fps: this.fps,
      landmarks,
      rotation: this.heldRotationPayload(),
      pointer: null,
      twoHand: { active: true, distance: this.zoomDistance }
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

  updatePinch(landmarks, palmScale, role) {
    const wrist = landmarks[0];
    const thumb = landmarks[4];
    const index = landmarks[8];
    const gap = this.dist(thumb, index) / palmScale;

    let othersTotal = 0;
    [12, 16, 20].forEach(tip => {
      othersTotal += this.dist(wrist, landmarks[tip]) / palmScale;
    });

    const othersAvg = othersTotal / 3;
    const wasPinching = this.pinchState[role] === true;
    const othersOk = othersAvg > (wasPinching ? 1.2 : 1.3);

    let pinching = wasPinching;
    if (wasPinching) {
      if (gap > this.pinchOff || !othersOk) pinching = false;
    } else if (gap < this.pinchOn && othersOk) {
      pinching = true;
    }
    if (role) this.pinchState[role] = pinching;

    return {
      pinching,
      x: (thumb.x + index.x) / 2,
      y: (thumb.y + index.y) / 2
    };
  }

  drawPinchMarker(nx, ny, width, height, role) {
    const ctx = this.ctx;
    const x = nx * width;
    const y = ny * height;
    const color = role === 'left' ? '255, 108, 183' : '167, 139, 250';
    ctx.save();
    ctx.shadowBlur = 14;
    ctx.shadowColor = `rgba(${color}, 0.9)`;
    ctx.beginPath();
    ctx.arc(x, y, 11 + Math.sin(this.pulse) * 1.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${color}, 0.35)`;
    ctx.fill();
    ctx.strokeStyle = `rgb(${color})`;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
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

  drawHandSkeleton(landmarks, width, height, openness, rotation = { roll: 0, yaw: 0 }, role = 'right') {
    const ctx = this.ctx;
    const isLeft = role === 'left';

    const red = isLeft ? 167 : Math.round(openness * 255);
    const green = isLeft ? 139 : Math.round((1 - openness * 0.5) * 240);
    const blue = isLeft ? 250 : Math.round(255 - openness * 120);
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
      gradient.addColorStop(0, isLeft ? '#c4b5fd' : '#55e8ff');
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
        ctx.fillStyle = isWrist ? (isLeft ? '#c4b5fd' : '#55e8ff') : '#74f6c7';
        ctx.fill();
      }
    });

    if (!isLeft) {
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
    }
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