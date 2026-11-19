import { SceneManager } from "./scene.js";
import { HandTracker } from "./handTracker.js";
import { processCustomGLTF, loadGLBModel } from "./models.js";
import { LabelManager } from "./labels.js";
import { sound } from "./audio.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { getModelBlobUrl, prefetchModels } from "./modelCache.js";

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
const btnAutoRotateQuick = $("#btn-auto-rotate-quick");
const rotateIcon = $("#rotate-icon");
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

// Loading progress
const modelLoadingBar = $("#model-loading-bar");
const modelLoadingFill = $("#model-loading-fill");

// Mobile controls
const mobileManualSlider = $("#mobile-manual-slider");
const mobilePercentageText = $("#mobile-percentage-text");
const mobileSnap0 = $("#mobile-snap-0");
const mobileSnap50 = $("#mobile-snap-50");
const mobileSnap100 = $("#mobile-snap-100");
const mobileSpreadBtns = $$(".mobile-chip[data-spread]");
const btnMobileViews = $("#btn-mobile-views");
const mobileViewsMenu = $("#mobile-views-menu");
const btnMobileParts = $("#btn-mobile-parts");
const mobilePartsCount = $("#mobile-parts-count");
const mobilePartsDrawer = $("#mobile-parts-drawer");
const mobileDrawerBackdrop = $("#mobile-drawer-backdrop");
const btnClosePartsDrawer = $("#btn-close-parts-drawer");
const mobileDrawerCount = $("#mobile-drawer-count");
const mobileDrawerList = $("#mobile-drawer-list");

// Control mode switcher tabs
const modeBtnManual = $("#mode-btn-manual");
const modeBtnHand = $("#mode-btn-hand");

let sceneMgr;
let handTracker;
let labelMgr;
let currentFactor = 0;
let currentModelKey = "car";
let currentControlMode = "manual"; // Default to manual control
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
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => toastEl.classList.remove("show"), duration);
}

function updateLoadingProgress(fraction) {
  if (!modelLoadingBar || !modelLoadingFill) return;
  const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  modelLoadingBar.style.display = "block";
  modelLoadingBar.style.opacity = "1";
  modelLoadingFill.style.width = `${pct}%`;

  if (pct >= 100) {
    setTimeout(() => {
      modelLoadingBar.style.opacity = "0";
      setTimeout(() => {
        modelLoadingBar.style.display = "none";
        modelLoadingFill.style.width = "0%";
      }, 300);
    }, 450);
  }
}

function setCameraUI(status, error = null) {
  if (!camStatusPill) return;
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

function setControlMode(mode, userInitiated = false) {
  currentControlMode = mode;
  const isManual = mode === "manual";

  if (modeBtnManual) {
    modeBtnManual.classList.toggle("active", isManual);
    modeBtnManual.setAttribute("aria-selected", String(isManual));
  }
  if (modeBtnHand) {
    modeBtnHand.classList.toggle("active", !isManual);
    modeBtnHand.setAttribute("aria-selected", String(!isManual));
  }

  document.body.classList.toggle("mode-manual", isManual);
  document.body.classList.toggle("mode-hand", !isManual);

  if (isManual) {
    if (handTracker?.isRunning) {
      toggleCameraAction();
    }
    if (userInitiated) {
      showToast("Manual Control active · Use touch or slider to dismantle", 2400);
      sound.playClick();
    }
  } else {
    if (!handTracker?.isRunning) {
      toggleCameraAction();
    }
    if (userInitiated) {
      showToast("Hand Tracking active · Show your palm to the camera", 2400);
      sound.playClick();
    }
  }
}

function setAutoRotate(enabled, notify = true) {
  if (!sceneMgr) return;
  sceneMgr.autoRotate = enabled;
  if (autoRotateToggle) autoRotateToggle.checked = enabled;
  if (btnAutoRotateQuick) {
    btnAutoRotateQuick.classList.toggle("active", enabled);
    if (rotateIcon) {
      rotateIcon.textContent = enabled ? "↻" : "⏸";
    }
  }
  if (notify) {
    showToast(enabled ? "Model auto-rotation enabled" : "Model auto-rotation stopped");
    sound.playClick();
  }
}

function setSoundEnabled(enabled, notify = true) {
  sound.setEnabled(enabled);
  if (btnSound) {
    btnSound.classList.toggle("active", enabled);
    if (soundIcon) soundIcon.textContent = enabled ? "♫" : "🔇";
  }
  if (notify) {
    showToast(enabled ? "Music & sound effects enabled" : "Music & sound muted");
  }
}

function setLabelsVisible(visible, notify = true) {
  if (!labelMgr) return;
  labelMgr.setVisibility(visible);
  if (btnLabels) btnLabels.classList.toggle("active", visible);
  const labelsToggle = $("#labels-toggle");
  if (labelsToggle) labelsToggle.checked = visible;
  if (notify) {
    showToast(visible ? "Component labels visible" : "Component labels hidden");
    sound.playClick();
  }
}

function initApp() {
  sound.init();
  sceneMgr = new SceneManager(canvasContainer);
  labelMgr = new LabelManager(labelsContainer, sceneMgr.camera);

  // When user clicks a label card: point to that 3D part and focus camera
  labelMgr.onSelectPart = (part, card) => {
    if (!part) {
      sceneMgr.clearFocusedPart();
      clearHighlightPartInList();
      return;
    }
    sceneMgr.focusOnPart(part, card);
    highlightPartInList(part);
    sound.playClick();
    showToast(`Focused: ${part.partName}`);
  };

  // When user clicks a 3D component directly on the canvas
  sceneMgr.onPartClicked = (part) => {
    const card = labelMgr.selectPart(part);
    sceneMgr.focusOnPart(part, card);
    highlightPartInList(part);
    sound.playClick();
    showToast(`Selected: ${part.partName}`);
  };

  sceneMgr.onCanvasEmptyClick = () => {
    sceneMgr.clearFocusedPart();
    labelMgr.clearSelection();
    clearHighlightPartInList();
  };

  handTracker = new HandTracker(webcamVideo, handCanvas, {
    onUpdate: handleHandTrackingUpdate,
    onStatus: ({ status, error }) => setCameraUI(status, error),
  });

  // Initial load
  loadModel("car").catch((error) => {
    console.error("Initial GLB load failed:", error);
  });

  // Prefetch remaining built-in models quietly in background
  const allModelUrls = Object.values(GLB_MODELS).map((m) => m.url);
  prefetchModels(allModelUrls);

  setupEventListeners();
  setControlMode("manual", false);
  setCameraUI("offline");
  animate(performance.now());
  showToast("Ready · Manual control active. Open palm or slide to dismantle");
}

async function getBuiltInModel(modelKey) {
  const config = GLB_MODELS[modelKey];
  if (!config) {
    throw new Error(`No GLB model configured for "${modelKey}"`);
  }

  const modelData = await loadGLBModel(config.url, (progress) => {
    updateLoadingProgress(progress);
  });

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
    updateLoadingProgress(0.08);

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
    if (mobilePartsCount) mobilePartsCount.textContent = `(${modelData.parts.length})`;
    if (mobileDrawerCount) mobileDrawerCount.textContent = `${modelData.parts.length}`;

    renderPartList(modelData.parts);
    updateOpennessDisplay(0);

    modelBtns.forEach((button) => {
      button.classList.toggle("active", button.dataset.model === modelKey);
    });

    showModelDiagnostics(modelData.diagnostics);
    updateLoadingProgress(1.0);

    const partCount = modelData.parts.length;
    if (modelData.diagnostics?.isSingleMesh) {
      showToast(`${config.name} loaded · single mesh`, 3500);
    } else {
      showToast(`${config.name} loaded · ${partCount} components`, 3000);
    }
  } catch (error) {
    console.error(`Failed to load ${modelKey}.glb:`, error);
    showToast(`Could not load ${config.name}: ${error.message}`, 6000);
    updateLoadingProgress(1.0);
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
  if (mobileDrawerList) mobileDrawerList.replaceChildren();

  if (!parts.length) {
    const empty = document.createElement("p");
    empty.className = "empty-parts";
    empty.textContent = "No detachable components were detected.";
    partListContainer.appendChild(empty);
    if (mobileDrawerList) {
      mobileDrawerList.appendChild(empty.cloneNode(true));
    }
    return;
  }

  parts.forEach((part, index) => {
    // Desktop part item
    const item = createPartItemElement(part, index, false);
    partListContainer.appendChild(item);

    // Mobile drawer part item
    if (mobileDrawerList) {
      const mobileItem = createPartItemElement(part, index, true);
      mobileDrawerList.appendChild(mobileItem);
    }
  });
}

function createPartItemElement(part, index, isMobile = false) {
  const item = document.createElement("button");
  item.type = "button";
  item.className = "part-item";
  item.dataset.index = String(index);
  item.dataset.partName = part.partName || `Component ${index + 1}`;

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
    const card = labelMgr.selectPart(part);
    sceneMgr.focusOnPart(part, card);
    highlightPartInList(part);
    sound.playClick();
    showToast(`Focused: ${part.partName}`);

    if (isMobile && mobilePartsDrawer) {
      setTimeout(() => {
        mobilePartsDrawer.hidden = true;
      }, 250);
    }
  });

  return item;
}

function highlightPartInList(part) {
  const targetName = part?.partName;
  $$(".part-item").forEach((item) => {
    const active = item.dataset.partName === targetName;
    item.classList.toggle("active", active);
    if (active && item.offsetParent !== null) {
      item.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });
}

function clearHighlightPartInList() {
  $$(".part-item").forEach((item) => item.classList.remove("active"));
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

  if (statFps) statFps.textContent = String(data.fps || 0);

  if (twoHand?.active) {
    gestureBadge.textContent = "TWO-HAND ZOOM";
    gestureBadge.className = "gesture-badge two-hands";
    if (statFingers) statFingers.textContent = "2 HANDS";
    if (statDist) {
      statDist.textContent = Number.isFinite(twoHand.distance)
        ? `ZOOM ${twoHand.distance.toFixed(2)}`
        : "ZOOM";
    }
  } else if (data.isDetected) {
    gestureBadge.textContent = data.gestureText || "TRACKING";
    gestureBadge.className = "gesture-badge";
    if (data.rightGesture === "OPEN HAND") gestureBadge.classList.add("open");
    if (data.rightGesture === "CLOSED FIST") gestureBadge.classList.add("fist");
    if (data.leftGesture === "PINCH GRAB") gestureBadge.classList.add("open");
    if (statFingers) {
      statFingers.textContent = data.rightGesture
        ? `${data.fingersCount}/5`
        : "—";
    }
    if (statDist) {
      statDist.textContent =
        data.rightGesture && data.rotation ? `${data.rotation.rollDeg}°` : "—";
    }
  } else {
    gestureBadge.textContent = "NO HAND";
    gestureBadge.className = "gesture-badge";
    if (statFingers) statFingers.textContent = "0/5";
    if (statDist) statDist.textContent = "—";
  }
}

function updateOpennessDisplay(factor) {
  const percentage = Math.round(Math.max(0, Math.min(1, factor)) * 100);
  if (opennessPercentage) opennessPercentage.textContent = `${percentage}%`;
  if (opennessBar) {
    opennessBar.style.width = `${percentage}%`;
    opennessBar.setAttribute("aria-valuenow", String(percentage));
  }
  if (mobilePercentageText) mobilePercentageText.textContent = `${percentage}%`;

  if (!manualOverrideActive) {
    if (manualSlider) manualSlider.value = String(percentage);
    if (sliderVal) sliderVal.textContent = `${percentage}%`;
    if (mobileManualSlider) mobileManualSlider.value = String(percentage);
  }

  if (percentage <= 4) {
    dismantleStateVal.textContent = "ASSEMBLED";
    dismantleStateVal.className = "tel-val state-assembled";
    updateSnapButtons(0);
  } else if (percentage >= 96) {
    dismantleStateVal.textContent = "FULLY SEPARATED";
    dismantleStateVal.className = "tel-val state-dismantled";
    updateSnapButtons(100);
  } else {
    dismantleStateVal.textContent = `SEPARATING · ${percentage}%`;
    dismantleStateVal.className = "tel-val state-moving";
    updateSnapButtons(percentage >= 45 && percentage <= 55 ? 50 : null);
  }

  if (handTracker?.isTwoHands) {
    dismantleStateVal.textContent += " · ZOOM";
  }
}

function updateSnapButtons(activePct) {
  if (mobileSnap0) mobileSnap0.classList.toggle("active", activePct === 0);
  if (mobileSnap50) mobileSnap50.classList.toggle("active", activePct === 50);
  if (mobileSnap100) mobileSnap100.classList.toggle("active", activePct === 100);
}

function setDismantleFactor(factor) {
  manualOverrideActive = true;
  clearTimeout(manualOverrideTimer);
  currentFactor = factor;
  if (manualSlider) manualSlider.value = String(Math.round(factor * 100));
  if (sliderVal) sliderVal.textContent = `${Math.round(factor * 100)}%`;
  if (mobileManualSlider) mobileManualSlider.value = String(Math.round(factor * 100));
  updateOpennessDisplay(factor);
  sound.playClick();
  manualOverrideTimer = setTimeout(() => {
    manualOverrideActive = false;
  }, 1600);
}

async function importModel(file) {
  if (!file) return;
  if (customModelUrl) {
    URL.revokeObjectURL(customModelUrl);
    customModelUrl = "";
  }

  showToast(`Loading ${file.name}…`, 5000);
  updateLoadingProgress(0.15);
  glbFileInput.disabled = true;

  try {
    const arrayBuffer = await file.arrayBuffer();
    updateLoadingProgress(0.5);
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

    const displayName = file.name.replace(/\.(glb|gltf)$/i, "").toUpperCase();
    modelNameVal.textContent = displayName;
    partCountVal.textContent = `${modelData.parts.length} PARTS`;
    if (mobilePartsCount) mobilePartsCount.textContent = `(${modelData.parts.length})`;
    if (mobileDrawerCount) mobileDrawerCount.textContent = `${modelData.parts.length}`;

    renderPartList(modelData.parts);
    updateOpennessDisplay(0);
    modelBtns.forEach((button) => button.classList.remove("active"));
    showModelDiagnostics(modelData.diagnostics);
    updateLoadingProgress(1.0);

    showToast(`Model imported · ${modelData.parts.length} components`);
    if (modelData.diagnostics?.isSingleMesh) {
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
      error?.message || "Could not read this model. Try a self-contained GLB file.",
      5000,
    );
    updateLoadingProgress(1.0);
  } finally {
    glbFileInput.disabled = false;
    glbFileInput.value = "";
  }
}

async function toggleCameraAction() {
  if (cameraBusy) return;
  cameraBusy = true;
  if (btnStartCamera) btnStartCamera.disabled = true;
  if (btnToggleCam) btnToggleCam.disabled = true;

  try {
    if (handTracker.isRunning) {
      await handTracker.stop();
      sceneMgr.endTwoHandZoom();
      manualOverrideActive = false;
      clearTimeout(manualOverrideTimer);
      currentFactor = 0;
      if (manualSlider) manualSlider.value = "0";
      if (sliderVal) sliderVal.textContent = "0%";
      if (mobileManualSlider) mobileManualSlider.value = "0";
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
    if (btnStartCamera) btnStartCamera.disabled = false;
    if (btnToggleCam) btnToggleCam.disabled = false;
  }
}

function setSeparationMultiplier(multiplier) {
  sceneMgr.spreadMultiplier = multiplier;
  spreadBtns.forEach((item) =>
    item.classList.toggle("active", Number(item.dataset.spread) === multiplier),
  );
  mobileSpreadBtns.forEach((item) =>
    item.classList.toggle("active", Number(item.dataset.spread) === multiplier),
  );
  sound.playClick();
  showToast(`Separation distance · ${multiplier.toFixed(1)}×`);
}

function setupEventListeners() {
  // Mode switcher tabs
  modeBtnManual?.addEventListener("click", () => setControlMode("manual", true));
  modeBtnHand?.addEventListener("click", () => setControlMode("hand", true));

  // Quick auto-rotate button
  btnAutoRotateQuick?.addEventListener("click", () => {
    setAutoRotate(!sceneMgr.autoRotate, true);
  });
  autoRotateToggle?.addEventListener("change", (e) => {
    setAutoRotate(e.target.checked, true);
  });

  // Sound / Music toggle
  btnSound?.addEventListener("click", () => {
    setSoundEnabled(!sound.enabled, true);
  });

  // Labels toggle
  btnLabels?.addEventListener("click", () => {
    setLabelsVisible(!labelMgr.visible, true);
  });
  const labelsToggle = $("#labels-toggle");
  labelsToggle?.addEventListener("change", (e) => {
    setLabelsVisible(e.target.checked, true);
  });

  // Model selection
  modelBtns.forEach((button) => {
    button.addEventListener("click", async () => {
      sound.playClick();
      const modelKey = button.dataset.model;
      await loadModel(modelKey);
    });
  });

  glbFileInput?.addEventListener("change", (event) =>
    importModel(event.target.files?.[0]),
  );

  // Desktop manual slider
  manualSlider?.addEventListener("input", (event) => {
    manualOverrideActive = true;
    currentFactor = Number(event.target.value) / 100;
    sliderVal.textContent = `${Math.round(currentFactor * 100)}%`;
    if (mobileManualSlider) mobileManualSlider.value = String(event.target.value);
    updateOpennessDisplay(currentFactor);
  });
  manualSlider?.addEventListener("change", () => {
    clearTimeout(manualOverrideTimer);
    manualOverrideTimer = setTimeout(() => {
      manualOverrideActive = false;
    }, 1400);
  });

  // Mobile manual slider
  mobileManualSlider?.addEventListener("input", (event) => {
    manualOverrideActive = true;
    currentFactor = Number(event.target.value) / 100;
    if (sliderVal) sliderVal.textContent = `${Math.round(currentFactor * 100)}%`;
    if (manualSlider) manualSlider.value = String(event.target.value);
    updateOpennessDisplay(currentFactor);
  });
  mobileManualSlider?.addEventListener("change", () => {
    clearTimeout(manualOverrideTimer);
    manualOverrideTimer = setTimeout(() => {
      manualOverrideActive = false;
    }, 1400);
  });

  // Mobile snap buttons
  mobileSnap0?.addEventListener("click", () => setDismantleFactor(0));
  mobileSnap50?.addEventListener("click", () => setDismantleFactor(0.5));
  mobileSnap100?.addEventListener("click", () => setDismantleFactor(1.0));

  // Spread multiplier chips
  spreadBtns.forEach((button) => {
    button.addEventListener("click", () => {
      setSeparationMultiplier(Number(button.dataset.spread));
    });
  });
  mobileSpreadBtns.forEach((button) => {
    button.addEventListener("click", () => {
      setSeparationMultiplier(Number(button.dataset.spread));
    });
  });

  // View presets
  $$(".view-btn[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      sound.playClick();
      const view = button.dataset.view;
      $$(".view-btn[data-view]").forEach((item) =>
        item.classList.toggle("active", item.dataset.view === view),
      );
      if (view === "explode") {
        setDismantleFactor(1.0);
      } else {
        sceneMgr.setPresetView(view);
      }
      if (mobileViewsMenu) mobileViewsMenu.hidden = true;
    });
  });

  // Mobile views menu button
  btnMobileViews?.addEventListener("click", () => {
    if (!mobileViewsMenu) return;
    mobileViewsMenu.hidden = !mobileViewsMenu.hidden;
    sound.playClick();
  });

  // Mobile parts drawer open/close
  btnMobileParts?.addEventListener("click", () => {
    if (!mobilePartsDrawer) return;
    mobilePartsDrawer.hidden = false;
    sound.playClick();
  });
  btnClosePartsDrawer?.addEventListener("click", () => {
    if (mobilePartsDrawer) mobilePartsDrawer.hidden = true;
  });
  mobileDrawerBackdrop?.addEventListener("click", () => {
    if (mobilePartsDrawer) mobilePartsDrawer.hidden = true;
  });

  // Camera buttons
  btnStartCamera?.addEventListener("click", toggleCameraAction);
  btnToggleCam?.addEventListener("click", toggleCameraAction);

  btnMirrorCam?.addEventListener("click", () => {
    isCameraMirrored = !isCameraMirrored;
    trackingViewport.classList.toggle("mirrored", isCameraMirrored);
    btnMirrorCam.classList.toggle("active", isCameraMirrored);
    sound.playClick();
    showToast(isCameraMirrored ? "Camera mirrored" : "Camera unmirrored");
  });
  trackingViewport.classList.toggle("mirrored", isCameraMirrored);
  btnMirrorCam?.classList.add("active");

  btnExpandCam?.addEventListener("click", () => {
    isCameraExpanded = !isCameraExpanded;
    trackingViewport.classList.toggle("expanded", isCameraExpanded);
    btnExpandCam.classList.toggle("active", isCameraExpanded);
    sound.playClick();
  });

  btnTheme?.addEventListener("click", () => {
    document.body.classList.toggle("theme-studio");
    const studio = document.body.classList.contains("theme-studio");
    btnTheme.classList.toggle("active", studio);
    sound.playClick();
    showToast(studio ? "Studio lighting theme" : "Midnight blue theme");
  });

  btnFullscreen?.addEventListener("click", async () => {
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
  const isMobile = window.innerWidth <= 840;
  const isHandModeActive = isMobile ? currentControlMode === "hand" : true;

  if (!manualOverrideActive && isHandModeActive && handTracker?.isRunning) {
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
