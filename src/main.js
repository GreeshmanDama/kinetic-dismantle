import { SceneManager } from "./scene.js";
import { HandTracker } from "./handTracker.js";
import { processCustomGLTF, loadGLBModel } from "./models.js";
import { LabelManager } from "./labels.js";
import { sound } from "./audio.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const canvasContainer = $("#canvas-container");
const labelsContainer = $("#labels-container");
const webcamVideo = $("#webcam-video");
const handCanvas = $("#hand-canvas");

const modelBtns = $$(".model-btn[data-model]");
const glbFileInput = $("#glb-file-input");
const modelNameVal = $("#model-name-val");
const partCountVal = $("#part-count-val");
const dismantleStateVal = $("#dismantle-state-val");
const opennessPercentage = $("#openness-percentage");
const opennessBar = $("#openness-bar");
const manualSlider = $("#manual-slider");
const sliderVal = $("#slider-val");
const autoRotateToggle = $("#auto-rotate-toggle");
const spreadBtns = $$(".chip-btn[data-spread]");
const viewBtns = $$(".view-btn[data-view]");
const btnMouseMode = $("#btn-mouse-mode");

const btnStartCamera = $("#btn-start-camera");
const btnToggleCam = $("#btn-toggle-cam");
const toggleCamText = $("#toggle-cam-text");
const toggleCamIcon = $("#toggle-cam-icon");
const camStatusPill = $("#cam-status-pill");
const camStatusText = $("#cam-status-text");
const webcamPlaceholder = $("#webcam-placeholder");
const gestureBadge = $("#detected-gesture-badge");
const statFingers = $("#stat-fingers");
const statDist = $("#stat-dist");
const statFps = $("#stat-fps");
const btnMirrorCam = $("#btn-mirror-cam");
const btnExpandCam = $("#btn-expand-cam");
const trackingViewport = $("#tracking-viewport");

const btnSound = $("#btn-sound");
const soundIcon = $("#sound-icon");
const btnLabels = $("#btn-labels");
const btnTheme = $("#btn-theme");
const btnFullscreen = $("#btn-fullscreen");
const toastEl = $("#toast-notification");
const partListContainer = $("#part-list");

let sceneMgr;
let handTracker;
let labelMgr;
let currentFactor = 0;
let currentModelKey = "car";
let manualOverrideActive = false;
let manualOverrideTimer = null;
let cameraBusy = false;
let isCameraMirrored = true;
let isCameraExpanded = false;
let lastFactorAudioCheck = 0;
let animationFrameId = null;
let lastFrameTime = performance.now();
let customModelUrl = "";

// ============================================================
// BUILT-IN GLB MODELS — SUPABASE STORAGE
// ============================================================

const GLB_MODELS = {
  car: {
    url: "https://jkyxrprhdanrplhbufof.supabase.co/storage/v1/object/public/GLB/porche.glb",
    name: "CUSTOM SUPERCAR",
  },

  airplane: {
    url: "https://jkyxrprhdanrplhbufof.supabase.co/storage/v1/object/public/GLB/gun.glb",
    name: "CUSTOM GUN",
  },

  bike: {
    url: "https://jkyxrprhdanrplhbufof.supabase.co/storage/v1/object/public/GLB/human_heart.glb",
    name: "HUMAN HEART",
  },

  drone: {
    url: "https://jkyxrprhdanrplhbufof.supabase.co/storage/v1/object/public/GLB/korean_building.glb",
    name: "KOREAN BUILDING",
  },
};

function showToast(message, duration = 2600) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => toastEl.classList.remove("show"), duration);
}

function setCameraUI(status, error = null) {
  camStatusPill.classList.toggle("active", status === "online");
  camStatusPill.classList.toggle("connecting", status === "connecting");

  if (status === "online") {
    camStatusText.textContent = "LIVE";
    toggleCamText.textContent = "Stop camera";
    toggleCamIcon.textContent = "■";
    webcamPlaceholder.hidden = true;
    trackingViewport.classList.add("live");
  } else if (status === "connecting") {
    camStatusText.textContent = "STARTING";
    toggleCamText.textContent = "Starting…";
    toggleCamIcon.textContent = "◌";
    webcamPlaceholder.hidden = false;
    trackingViewport.classList.remove("live");
  } else if (status === "error") {
    camStatusText.textContent = "ERROR";
    toggleCamText.textContent = "Try again";
    toggleCamIcon.textContent = "↻";
    webcamPlaceholder.hidden = false;
    trackingViewport.classList.remove("live");
    if (error) console.error("Camera error:", error);
  } else {
    camStatusText.textContent = "OFFLINE";
    toggleCamText.textContent = "Start camera";
    toggleCamIcon.textContent = "▶";
    webcamPlaceholder.hidden = false;
    trackingViewport.classList.remove("live");
  }
}

function initApp() {
  sound.init();
  sceneMgr = new SceneManager(canvasContainer);
  labelMgr = new LabelManager(labelsContainer, sceneMgr.camera);
  labelMgr.onSelectPart = (part) => {
    sceneMgr.focusOnPart(part);
    highlightPartInList(part);
    showToast(`Focused: ${part.partName}`);
  };

  handTracker = new HandTracker(webcamVideo, handCanvas, {
    onUpdate: handleHandTrackingUpdate,
    onStatus: ({ status, error }) => setCameraUI(status, error),
  });

  loadModel("car").catch((error) => {
    console.error("Initial GLB load failed:", error);
  });

  setupEventListeners();
  setCameraUI("offline");
  animate(performance.now());
  showToast("Ready · Open your palm to separate the components");
}

async function getBuiltInModel(modelKey) {
  const config = GLB_MODELS[modelKey];

  if (!config) {
    throw new Error(`No GLB model configured for "${modelKey}"`);
  }

  const modelData = await loadGLBModel(config.url);

  modelData.displayName = config.name;

  return modelData;
}

async function loadModel(modelKey) {
  const config = GLB_MODELS[modelKey];

  if (!config) {
    showToast(`No GLB configured for ${modelKey}`);
    return;
  }

  try {
    showToast(`Loading ${config.name}…`, 5000);

    modelBtns.forEach((button) => {
      button.disabled = true;
    });

    const modelData = await getBuiltInModel(modelKey);

    currentModelKey = modelKey;
    manualOverrideActive = false;

    clearTimeout(manualOverrideTimer);

    currentFactor = 0;

    sceneMgr.loadModelData(modelData);

    labelMgr.setParts(modelData.parts);

    modelNameVal.textContent = modelData.displayName || config.name;

    partCountVal.textContent = `${modelData.parts.length} PARTS`;

    renderPartList(modelData.parts);

    updateOpennessDisplay(0);

    modelBtns.forEach((button) => {
      button.classList.toggle("active", button.dataset.model === modelKey);
    });

    showModelDiagnostics(modelData.diagnostics);

    const partCount = modelData.parts.length;

    if (modelData.diagnostics?.isSingleMesh) {
      showToast(`${config.name} loaded · single mesh`, 4000);
    } else {
      showToast(`${config.name} loaded · ${partCount} components`, 3500);
    }
  } catch (error) {
    console.error(`Failed to load ${modelKey}.glb:`, error);

    showToast(`Could not load ${config.name}: ${error.message}`, 6000);
  } finally {
    modelBtns.forEach((button) => {
      button.disabled = false;
    });
  }
}

function showModelDiagnostics(diagnostics) {
  const notice = $("#model-notice");
  if (!notice) return;
  if (diagnostics?.isSingleMesh) {
    notice.textContent = diagnostics.message;
    notice.hidden = false;
    notice.classList.add("warning");
  } else if (diagnostics?.message && diagnostics.meshCount) {
    notice.textContent = diagnostics.message;
    notice.hidden = false;
    notice.classList.remove("warning");
  } else {
    notice.hidden = true;
    notice.textContent = "";
  }
}

function renderPartList(parts) {
  partListContainer.replaceChildren();
  if (!parts.length) {
    const empty = document.createElement("p");
    empty.className = "empty-parts";
    empty.textContent = "No detachable components were detected.";
    partListContainer.appendChild(empty);
    return;
  }

  parts.forEach((part, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "part-item";
    item.dataset.index = String(index);

    const info = document.createElement("span");
    info.className = "part-info";
    const dot = document.createElement("span");
    dot.className = "part-tag-dot";
    dot.style.background = part.colorHex || "#65dfff";
    const text = document.createElement("span");
    text.className = "part-copy";
    const title = document.createElement("span");
    title.className = "part-title";
    title.textContent = part.partName || `Component ${index + 1}`;
    const category = document.createElement("span");
    category.className = "part-cat";
    category.textContent = part.category || "Component";
    text.append(title, category);
    info.append(dot, text);

    const number = document.createElement("span");
    number.className = "part-number";
    number.textContent = String(index + 1).padStart(2, "0");
    item.append(info, number);
    item.addEventListener("click", () => {
      sceneMgr.focusOnPart(part);
      highlightPartInList(part);
      sound.playClick();
    });
    partListContainer.appendChild(item);
  });
}

function highlightPartInList(part) {
  partListContainer.querySelectorAll(".part-item").forEach((item) => {
    const active =
      item.querySelector(".part-title")?.textContent === part.partName;
    item.classList.toggle("active", active);
    if (active) item.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

function handleHandTrackingUpdate(data) {
  const twoHand = data.twoHand;
  if (twoHand?.active) sceneMgr?.updateTwoHandZoom(twoHand.distance);
  else sceneMgr?.endTwoHandZoom();

  if (data.pointer && !twoHand?.active) {
    sceneMgr?.setHandPointer({
      x: isCameraMirrored ? 1 - data.pointer.x : data.pointer.x,
      y: data.pointer.y,
      pinching: data.pointer.pinching,
    });
  } else {
    sceneMgr?.setHandPointer(null);
  }

  statFps.textContent = String(data.fps || 0);

  if (twoHand?.active) {
    gestureBadge.textContent = "TWO-HAND ZOOM";
    gestureBadge.className = "gesture-badge two-hands";
    statFingers.textContent = "2 HANDS";
    statDist.textContent = Number.isFinite(twoHand.distance)
      ? `ZOOM ${twoHand.distance.toFixed(2)}`
      : "ZOOM";
  } else if (data.isDetected) {
    gestureBadge.textContent = data.gestureText || "TRACKING";
    gestureBadge.className = "gesture-badge";
    if (data.rightGesture === "OPEN HAND") gestureBadge.classList.add("open");
    if (data.rightGesture === "CLOSED FIST") gestureBadge.classList.add("fist");
    if (data.leftGesture === "PINCH GRAB") gestureBadge.classList.add("open");
    statFingers.textContent = data.rightGesture
      ? `${data.fingersCount}/5`
      : "—";
    statDist.textContent =
      data.rightGesture && data.rotation ? `${data.rotation.rollDeg}°` : "—";
  } else {
    gestureBadge.textContent = "NO HAND";
    gestureBadge.className = "gesture-badge";
    statFingers.textContent = "0/5";
    statDist.textContent = "—";
  }
}

function updateOpennessDisplay(factor) {
  const percentage = Math.round(Math.max(0, Math.min(1, factor)) * 100);
  opennessPercentage.textContent = `${percentage}%`;
  opennessBar.style.width = `${percentage}%`;
  opennessBar.setAttribute("aria-valuenow", String(percentage));

  if (!manualOverrideActive) {
    manualSlider.value = String(percentage);
    sliderVal.textContent = `${percentage}%`;
  }

  if (percentage <= 5) {
    dismantleStateVal.textContent = "ASSEMBLED";
    dismantleStateVal.className = "tel-val state-assembled";
  } else if (percentage >= 95) {
    dismantleStateVal.textContent = "FULLY SEPARATED";
    dismantleStateVal.className = "tel-val state-dismantled";
  } else {
    dismantleStateVal.textContent = `SEPARATING · ${percentage}%`;
    dismantleStateVal.className = "tel-val state-moving";
  }

  if (handTracker?.isTwoHands) {
    dismantleStateVal.textContent += " · ZOOM";
  }
}

async function importModel(file) {
  if (!file) return;
  if (customModelUrl) {
    URL.revokeObjectURL(customModelUrl);
    customModelUrl = "";
  }

  showToast(`Loading ${file.name}…`, 5000);
  glbFileInput.disabled = true;
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loader = new GLTFLoader();
    const gltf = await new Promise((resolve, reject) => {
      loader.parse(arrayBuffer, "", resolve, reject);
    });

    const modelData = processCustomGLTF(gltf.scene);
    currentModelKey = "custom";
    currentFactor = 0;
    manualOverrideActive = false;
    sceneMgr.loadModelData(modelData);
    labelMgr.setParts(modelData.parts);
    modelNameVal.textContent = file.name
      .replace(/\.(glb|gltf)$/i, "")
      .toUpperCase();
    partCountVal.textContent = `${modelData.parts.length} PARTS`;
    renderPartList(modelData.parts);
    updateOpennessDisplay(0);
    modelBtns.forEach((button) => button.classList.remove("active"));
    showModelDiagnostics(modelData.diagnostics);

    const diagnosticText =
      modelData.diagnostics?.message ||
      `Detected ${modelData.parts.length} mesh components.`;
    showToast(
      `Model imported · ${modelData.parts.length} component${modelData.parts.length === 1 ? "" : "s"}`,
    );
    if (modelData.diagnostics?.isSingleMesh) {
      console.info(diagnosticText);
      setTimeout(
        () =>
          showToast(
            "Single-mesh model: only the complete object can move. Import a multi-object GLB to dismantle parts.",
            5200,
          ),
        500,
      );
    }
  } catch (error) {
    console.error("GLB import failed:", error);
    showToast(
      error?.message ||
        "Could not read this model. Try a self-contained GLB file.",
      5000,
    );
  } finally {
    glbFileInput.disabled = false;
    glbFileInput.value = "";
  }
}

async function toggleCameraAction() {
  if (cameraBusy) return;
  cameraBusy = true;
  btnStartCamera.disabled = true;
  btnToggleCam.disabled = true;

  try {
    if (handTracker.isRunning) {
      await handTracker.stop();
      sceneMgr.endTwoHandZoom();
      manualOverrideActive = false;
      clearTimeout(manualOverrideTimer);
      currentFactor = 0;
      manualSlider.value = "0";
      sliderVal.textContent = "0%";
      sceneMgr.updateDismantle(0);
      updateOpennessDisplay(0);
      showToast("Camera stopped · model returned to assembled state");
    } else {
      sound.init();
      await handTracker.start();
      if (handTracker.isRunning) {
        showToast("Tracking live · open your palm to separate the model");
      }
    }
  } catch (error) {
    console.error("Unable to start camera:", error);
    setCameraUI("error", error);
    const detail =
      error?.name === "NotAllowedError"
        ? "Allow camera permission in your browser, then try again."
        : error?.name === "NotFoundError"
          ? "No webcam was found. Connect a camera and retry."
          : error?.message || "Camera could not start.";
    showToast(detail, 5200);
  } finally {
    cameraBusy = false;
    btnStartCamera.disabled = false;
    btnToggleCam.disabled = false;
  }
}

function setupEventListeners() {
  modelBtns.forEach((button) => {
    button.addEventListener("click", async () => {
      sound.playClick();

      const modelKey = button.dataset.model;

      await loadModel(modelKey);
    });
  });

  glbFileInput.addEventListener("change", (event) =>
    importModel(event.target.files?.[0]),
  );

  manualSlider.addEventListener("input", (event) => {
    manualOverrideActive = true;
    currentFactor = Number(event.target.value) / 100;
    sliderVal.textContent = `${Math.round(currentFactor * 100)}%`;
    updateOpennessDisplay(currentFactor);
  });
  manualSlider.addEventListener("change", () => {
    clearTimeout(manualOverrideTimer);
    manualOverrideTimer = setTimeout(() => {
      manualOverrideActive = false;
    }, 1400);
  });

  autoRotateToggle.addEventListener("change", (event) => {
    sceneMgr.autoRotate = event.target.checked;
  });

  spreadBtns.forEach((button) => {
    button.addEventListener("click", () => {
      spreadBtns.forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      sceneMgr.spreadMultiplier = Number(button.dataset.spread);
      sound.playClick();
      showToast(
        `Separation distance · ${sceneMgr.spreadMultiplier.toFixed(1)}×`,
      );
    });
  });

  viewBtns.forEach((button) => {
    button.addEventListener("click", () => {
      sound.playClick();
      const view = button.dataset.view;
      viewBtns.forEach((item) =>
        item.classList.toggle("active", item === button),
      );
      if (view === "explode") {
        manualOverrideActive = true;
        clearTimeout(manualOverrideTimer);
        currentFactor = 1;
        manualSlider.value = "100";
        sliderVal.textContent = "100%";
        manualOverrideTimer = setTimeout(() => {
          manualOverrideActive = false;
        }, 1600);
      } else {
        sceneMgr.setPresetView(view);
      }
    });
  });

  btnStartCamera.addEventListener("click", toggleCameraAction);
  btnToggleCam.addEventListener("click", toggleCameraAction);

  btnMirrorCam.addEventListener("click", () => {
    isCameraMirrored = !isCameraMirrored;
    trackingViewport.classList.toggle("mirrored", isCameraMirrored);
    btnMirrorCam.classList.toggle("active", isCameraMirrored);
    sound.playClick();
    showToast(isCameraMirrored ? "Camera mirrored" : "Camera unmirrored");
  });
  trackingViewport.classList.toggle("mirrored", isCameraMirrored);
  btnMirrorCam.classList.add("active");

  btnExpandCam.addEventListener("click", () => {
    isCameraExpanded = !isCameraExpanded;
    trackingViewport.classList.toggle("expanded", isCameraExpanded);
    btnExpandCam.classList.toggle("active", isCameraExpanded);
    sound.playClick();
  });

  btnSound.addEventListener("click", () => {
    const enabled = sound.toggle();
    btnSound.classList.toggle("active", enabled);
    soundIcon.textContent = enabled ? "♫" : "♪";
    showToast(enabled ? "Sound effects enabled" : "Sound muted");
  });

  const labelsToggle = $("#labels-toggle");
  const syncLabels = (visible) => {
    labelMgr.setVisibility(visible);
    btnLabels.classList.toggle("active", visible);
    labelsToggle.checked = visible;
  };
  btnLabels.addEventListener("click", () => {
    syncLabels(!labelMgr.visible);
    sound.playClick();
  });
  labelsToggle.addEventListener("change", (event) =>
    syncLabels(event.target.checked),
  );

  btnTheme.addEventListener("click", () => {
    document.body.classList.toggle("theme-studio");
    const studio = document.body.classList.contains("theme-studio");
    btnTheme.classList.toggle("active", studio);
    sound.playClick();
    showToast(studio ? "Studio lighting theme" : "Midnight blue theme");
  });

  btnFullscreen.addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement)
        await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (error) {
      showToast("Fullscreen is unavailable in this browser.");
    }
  });

  if (btnMouseMode) {
    btnMouseMode.addEventListener("click", () => {
      sound.playClick();
      const currentMode = sceneMgr.mouseMode;
      const newMode = currentMode === "drag" ? "orbit" : "drag";
      sceneMgr.setMouseMode(newMode);
      btnMouseMode.classList.toggle("active", newMode === "drag");
      btnMouseMode.innerHTML =
        newMode === "drag"
          ? '<span class="btn-mode-icon">✥</span> Drag anywhere'
          : '<span class="btn-mode-icon">↻</span> Orbit rotate';
      showToast(
        newMode === "drag"
          ? "Left click: Drag model anywhere on screen"
          : "Left click: Orbit rotate around center",
      );
    });
  }
}

function animate(now) {
  animationFrameId = requestAnimationFrame(animate);
  const dt = Math.min(Math.max((now - lastFrameTime) / 1000, 0.001), 0.05);
  lastFrameTime = now;

  let handRotation = null;
  if (!manualOverrideActive && handTracker?.isRunning) {
    currentFactor = handTracker.getSmoothOpenness(dt);
    if (handTracker.isHandPresent) {
      handRotation = handTracker.getSmoothRotation(dt);
    }
  }

  sceneMgr.applyHandRotation(
    handRotation,
    currentFactor,
    Boolean(handTracker?.isHandPresent),
    dt,
  );
  sound.updateServo(currentFactor, dt);

  if (currentFactor <= 0.025 && lastFactorAudioCheck > 0.08)
    sound.playLockSound();
  if (currentFactor >= 0.97 && lastFactorAudioCheck < 0.9)
    sound.playExplodeCompleteSound();
  lastFactorAudioCheck = currentFactor;

  sceneMgr.updateDismantle(currentFactor, handRotation, dt);
  updateOpennessDisplay(currentFactor);
  labelMgr.update(currentFactor, sceneMgr.width, sceneMgr.height);
  sceneMgr.render(dt);
}

window.addEventListener("DOMContentLoaded", initApp, { once: true });
window.addEventListener("beforeunload", () => {
  if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
  handTracker?.stop();
  sceneMgr?.dispose();
  if (customModelUrl) URL.revokeObjectURL(customModelUrl);
});
