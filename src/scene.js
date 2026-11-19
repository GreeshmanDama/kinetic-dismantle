import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const MIN_HAND_DISTANCE = 0.04;
const ZERO_VECTOR = new THREE.Vector3();
const UP_VECTOR = new THREE.Vector3(0, 1, 0);

export class SceneManager {
  constructor(container) {
    this.container = container;
    this.width = container.clientWidth || window.innerWidth;
    this.height = container.clientHeight || window.innerHeight;
    this.explosionParticles = null;
    this.pointer = null;
    this.pointerSmooth = null;
    this.pointerReach = 1.0;
    this.overlay = null;
    this.partRaycaster = new THREE.Raycaster();
    this.partPointerNdc = new THREE.Vector2();
    this.partGrabPlane = new THREE.Plane();
    this.partGrabIntersection = new THREE.Vector3();
    this.partGrabObjectWorld = new THREE.Vector3();
    this.partGrabTargetWorld = new THREE.Vector3();
    this.partGrabTargetLocal = new THREE.Vector3();
    this.partCameraDirection = new THREE.Vector3();
    this.partProjected = new THREE.Vector3();
    this.partBounds = new THREE.Box3();
    this.partGrabOffset = new THREE.Vector3();
    this.partGrab = null;
    this.partHover = null;
    this.partWasPinching = false;
    this.partGrabEnabled = true;
    this.partHoverRadiusPx = 90;

    this.scene = new THREE.Scene();
    this.scene.background = null;
    this.scene.fog = null;

    this.camera = new THREE.PerspectiveCamera(
      38,
      this.width / this.height,
      0.1,
      150,
    );
    this.camera.position.set(7, 5, 9);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Interactive 3D model viewport",
    );
    this.container.appendChild(this.renderer.domElement);

    this.modelElevationY = 0;
    this.modelTarget = new THREE.Vector3(0, this.modelElevationY, 0);
    this.modelRadius = 2.2;
    this.explodedRadius = 2.2;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.065;
    this.controls.rotateSpeed = 0.72;
    this.controls.zoomSpeed = 0.85;
    this.controls.panSpeed = 1.0;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 2.2;
    this.controls.maxDistance = 35;
    this.controls.maxPolarAngle = Math.PI - 0.02;
    this.controls.target.copy(this.modelTarget);
    this.isInteracting = false;
    this.mouseMode = "orbit";
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    this.controls.addEventListener("start", () => {
      this.isInteracting = true;
    });
    this.controls.addEventListener("end", () => {
      this.isInteracting = false;
    });

    this.setupLighting();
    this.setupEnvironment();
    this.currentModelRoot = null;
    this.currentParts = [];
    this.spreadMultiplier = 1;
    this.baseSpreadScale = 0.62;
    this.autoRotate = true;
    this.isHandControllingRotation = false;
    this.isTransitioningCamera = false;
    this.targetCamPos = new THREE.Vector3();
    this.targetControlsTarget = new THREE.Vector3();
    this.zoomActive = false;
    this.zoomSensitivity = 1.5;
    this.zoomSmoothing = 9;
    this.zoomStartHandDistance = 0;
    this.zoomStartCamDistance = 0;
    this.zoomTargetDistance = null;

    // Focused part pointing state
    this.focusedPart = null;
    this.focusedCard = null;
    this.onPartClicked = null;
    this.onCanvasEmptyClick = null;

    this._offsetVec = new THREE.Vector3();
    this._pivotA = new THREE.Vector3();
    this._pivotB = new THREE.Vector3();
    this._euler = new THREE.Euler();
    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._partDepthVector = new THREE.Vector3();

    this._setupPointerOverlay();
    this._setupCanvasTapDetection();

    this.resizeObserver = new ResizeObserver(() => this.onWindowResize());
    this.resizeObserver.observe(container);
    window.addEventListener("resize", this.onWindowResize);
  }

  _setupCanvasTapDetection() {
    let tapStartX = 0;
    let tapStartY = 0;
    let tapStartTime = 0;

    this.renderer.domElement.addEventListener("pointerdown", (e) => {
      tapStartX = e.clientX;
      tapStartY = e.clientY;
      tapStartTime = performance.now();
    });

    this.renderer.domElement.addEventListener("pointerup", (e) => {
      const dist = Math.hypot(e.clientX - tapStartX, e.clientY - tapStartY);
      const duration = performance.now() - tapStartTime;
      if (dist < 8 && duration < 380) {
        this._handleCanvasTap(e.clientX, e.clientY);
      }
    });
  }

  _handleCanvasTap(clientX, clientY) {
    if (!this.currentParts.length) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.partPointerNdc.set(x, y);
    this.camera.updateMatrixWorld();
    this.currentModelRoot?.updateMatrixWorld(true);
    this.partRaycaster.setFromCamera(this.partPointerNdc, this.camera);

    const roots = this.currentParts
      .map((part) => part.object)
      .filter((object) => object && object.visible);

    if (roots.length) {
      const hits = this.partRaycaster.intersectObjects(roots, true);
      for (const hit of hits) {
        let node = hit.object;
        while (node) {
          const part = this.currentParts.find((candidate) => candidate.object === node);
          if (part) {
            this.onPartClicked?.(part);
            return;
          }
          node = node.parent;
        }
      }
    }

    this.onCanvasEmptyClick?.();
  }

  setHandPointer(pointer) {
    this.pointer = pointer
      ? { x: pointer.x, y: pointer.y, pinching: !!pointer.pinching }
      : null;
  }

  _stepPointer(dt) {
    const pointer = this.pointer;
    if (!pointer) {
      this.pointerSmooth = null;
      return;
    }

    const reach = this.pointerReach;
    const targetX = THREE.MathUtils.clamp(
      (pointer.x - 0.5) * reach + 0.5,
      0,
      1,
    );
    const targetY = THREE.MathUtils.clamp(
      (pointer.y - 0.5) * reach + 0.5,
      0,
      1,
    );

    if (!this.pointerSmooth) {
      this.pointerSmooth = {
        x: targetX,
        y: targetY,
        pinching: pointer.pinching,
      };
      return;
    }

    const alpha = 1 - Math.exp(-24 * Math.max(dt, 0.001));
    this.pointerSmooth.x += (targetX - this.pointerSmooth.x) * alpha;
    this.pointerSmooth.y += (targetY - this.pointerSmooth.y) * alpha;
    this.pointerSmooth.pinching = pointer.pinching;
  }

  _setPartPointerRay() {
    const ps = this.pointerSmooth;
    if (!ps || !this.width || !this.height) return false;

    this.partPointerNdc.set(ps.x * 2 - 1, 1 - ps.y * 2);
    this.camera.updateMatrixWorld();
    this.currentModelRoot?.updateMatrixWorld(true);
    this.partRaycaster.setFromCamera(this.partPointerNdc, this.camera);
    return true;
  }

  _pickGLBPart() {
    if (!this.currentParts.length || !this._setPartPointerRay()) return null;

    const roots = this.currentParts
      .map((part) => part.object)
      .filter((object) => object && object.visible);
    if (!roots.length) return null;

    const hits = this.partRaycaster.intersectObjects(roots, true);
    for (const hit of hits) {
      let node = hit.object;
      while (node) {
        const part = this.currentParts.find(
          (candidate) => candidate.object === node,
        );
        if (part) return { part, hit };
        node = node.parent;
      }
    }
    return null;
  }

  _releaseGLBPart() {
    this.partGrab = null;
  }

  _updatePartInteraction(dt, progress) {
    const ps = this.pointerSmooth;
    const canGrab =
      this.partGrabEnabled &&
      !!ps &&
      !this.zoomActive &&
      this.currentParts.length > 0 &&
      progress > 0.035;

    if (!canGrab) {
      this._releaseGLBPart();
      this.partHover = null;
      this.partWasPinching = false;
      this._updatePartPointerOverlay();
      return;
    }

    let picked = null;

    if (ps.pinching && !this.partWasPinching && !this.partGrab) {
      picked = this._pickGLBPart();
      if (picked) {
        const { part, hit } = picked;
        this.camera.getWorldDirection(this.partCameraDirection).normalize();
        this.partGrabPlane.setFromNormalAndCoplanarPoint(
          this.partCameraDirection,
          hit.point,
        );
        part.object.getWorldPosition(this.partGrabObjectWorld);
        this.partGrabOffset.copy(this.partGrabObjectWorld).sub(hit.point);
        this.partGrab = { part };
        this.partHover = part;
      }
    }

    if (ps.pinching && this.partGrab) {
      if (this._setPartPointerRay()) {
        const intersection = this.partRaycaster.ray.intersectPlane(
          this.partGrabPlane,
          this.partGrabIntersection,
        );

        if (intersection) {
          const part = this.partGrab.part;
          const parent = part.object.parent;
          this.partGrabTargetWorld.copy(intersection).add(this.partGrabOffset);

          if (parent) {
            parent.updateMatrixWorld(true);
            this.partGrabTargetLocal.copy(this.partGrabTargetWorld);
            parent.worldToLocal(this.partGrabTargetLocal);
          } else {
            this.partGrabTargetLocal.copy(this.partGrabTargetWorld);
          }

          if (!part._manualOffset) part._manualOffset = new THREE.Vector3();

          const basePosition = part._dismantleBasePosition || part.originalPos;
          const safeProgress = Math.max(progress, 0.035);

          part._manualOffset
            .copy(this.partGrabTargetLocal)
            .sub(basePosition)
            .multiplyScalar(1 / safeProgress);
          part.object.position.copy(this.partGrabTargetLocal);
          this.partHover = part;
          this.currentModelRoot?.updateMatrixWorld(true);
        }
      }
    } else if (!ps.pinching && this.partGrab) {
      this._releaseGLBPart();
    }

    if (!ps.pinching || !this.partGrab) {
      picked = this._pickGLBPart();
      this.partHover = picked?.part || null;
    }

    this.partWasPinching = ps.pinching;
    this._updatePartPointerOverlay();
  }

  _updatePartPointerOverlay() {
    const o = this.overlay;
    if (!o) return;

    const ps = this.pointerSmooth;
    if (!ps || this.zoomActive) {
      o.cursor.style.display = "none";
      this._hideTarget();
      return;
    }

    const px = ps.x * this.width;
    const py = ps.y * this.height;
    o.cursor.style.display = "block";
    o.cursor.style.transform = `translate(${px}px,${py}px) translate(-50%,-50%)`;

    if (o.pinchShown !== ps.pinching) {
      o.pinchShown = ps.pinching;
      o.cursor.style.width = o.cursor.style.height = ps.pinching
        ? "22px"
        : "34px";
      o.cursor.style.borderColor = ps.pinching
        ? "#ff6cb7"
        : "rgba(101,223,255,.95)";
      o.cursor.style.background = ps.pinching
        ? "rgba(255,108,183,.35)"
        : "transparent";
    }

    const part = this.partGrab?.part || this.partHover;
    if (!part || !part.object) {
      this._hideTarget();
      return;
    }

    this.currentModelRoot?.updateMatrixWorld(true);
    this.camera.updateMatrixWorld();
    this.partBounds.setFromObject(part.object);
    this.partBounds.getCenter(this.partProjected);
    const cameraForward = this.camera.getWorldDirection(
      this.partCameraDirection,
    );
    const depth = this._partDepthVector
      .copy(this.partProjected)
      .sub(this.camera.position)
      .dot(cameraForward);
    if (depth <= 0) {
      this._hideTarget();
      return;
    }

    this.partProjected.project(this.camera);
    const x = (this.partProjected.x * 0.5 + 0.5) * this.width;
    const y = (-this.partProjected.y * 0.5 + 0.5) * this.height;
    if (x < -40 || x > this.width + 40 || y < -40 || y > this.height + 40) {
      this._hideTarget();
      return;
    }

    const flip = x > this.width * 0.65;
    const below = y < 70;
    const dx = flip ? -30 : 30;
    const dy = below ? 34 : -34;
    const holding = !!this.partGrab;

    o.ring.style.display = "block";
    o.ring.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
    o.ring.style.borderColor = holding ? "#ff6cb7" : "#ffffff";
    o.line.style.display = "block";
    o.line.setAttribute("x1", x);
    o.line.setAttribute("y1", y);
    o.line.setAttribute("x2", x + dx);
    o.line.setAttribute("y2", y + dy);

    const stateText = holding
      ? "DRAGGING · RELEASE TO DROP"
      : "PINCH TO MOVE PART";
    const key = `${part.partName || "GLB component"}|${stateText}`;
    if (o.labelKey !== key) {
      o.labelKey = key;
      o.nameEl.textContent = part.partName || "GLB component";
      o.stateEl.textContent = stateText;
    }
    o.label.style.display = "block";
    o.label.style.transform =
      `translate(${x + dx}px,${y + dy}px) ` +
      `translate(${flip ? "-100%" : "0"},${below ? "0" : "-100%"})`;
  }

  disposeExplosionParticles() {
    if (!this.explosionParticles) return;
    this.scene.remove(this.explosionParticles);
    this.explosionParticles.geometry?.dispose();
    this.explosionParticles.material?.map?.dispose();
    this.explosionParticles.material?.dispose();
    this.explosionParticles = null;
  }

  _setupPointerOverlay() {
    if (getComputedStyle(this.container).position === "static") {
      this.container.style.position = "relative";
    }

    const root = document.createElement("div");
    root.setAttribute("aria-hidden", "true");
    root.style.cssText =
      "position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:6;";

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.cssText = "position:absolute;inset:0;overflow:visible;";
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("stroke", "rgba(101,223,255,0.9)");
    line.setAttribute("stroke-width", "1.5");
    line.style.display = "none";
    svg.appendChild(line);

    // Leader path for focused component selection
    const leaderPath = document.createElementNS(svgNS, "path");
    leaderPath.setAttribute("fill", "none");
    leaderPath.setAttribute("stroke", "#00d2ff");
    leaderPath.setAttribute("stroke-width", "2");
    leaderPath.setAttribute("stroke-dasharray", "6 3");
    leaderPath.setAttribute("class", "pointer-leader-path");
    leaderPath.style.display = "none";
    leaderPath.style.filter = "drop-shadow(0 0 6px rgba(0, 210, 255, 0.85))";

    const startCircle = document.createElementNS(svgNS, "circle");
    startCircle.setAttribute("r", "4");
    startCircle.setAttribute("fill", "#00d2ff");
    startCircle.style.display = "none";

    const endCircle = document.createElementNS(svgNS, "circle");
    endCircle.setAttribute("r", "4");
    endCircle.setAttribute("fill", "#ffffff");
    endCircle.style.display = "none";

    svg.append(leaderPath, startCircle, endCircle);

    const cursor = document.createElement("div");
    cursor.style.cssText =
      "position:absolute;left:0;top:0;width:34px;height:34px;box-sizing:border-box;" +
      "border:2px solid rgba(101,223,255,.95);border-radius:50%;" +
      "box-shadow:0 0 14px rgba(101,223,255,.7);display:none;will-change:transform;" +
      "transition:width .12s,height .12s,background .12s,border-color .12s;";
    const dot = document.createElement("div");
    dot.style.cssText =
      "position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px 0 0 -2px;" +
      "border-radius:50%;background:#fff;";
    cursor.appendChild(dot);

    const ring = document.createElement("div");
    ring.style.cssText =
      "position:absolute;left:0;top:0;width:22px;height:22px;box-sizing:border-box;" +
      "border:2px solid #fff;border-radius:50%;box-shadow:0 0 10px rgba(255,255,255,.8);" +
      "display:none;will-change:transform;";

    const label = document.createElement("div");
    label.style.cssText =
      "position:absolute;left:0;top:0;padding:4px 9px;" +
      "font:600 11px/1.25 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em;" +
      "color:#e8fbff;background:rgba(8,20,34,.85);border:1px solid rgba(101,223,255,.7);" +
      "border-radius:6px;white-space:nowrap;display:none;will-change:transform;";
    const nameEl = document.createElement("span");
    nameEl.style.display = "block";
    const stateEl = document.createElement("span");
    stateEl.style.cssText =
      "display:block;font-size:9px;opacity:.7;letter-spacing:.14em;";
    label.append(nameEl, stateEl);

    // High-tech target beacon attached to 3D focused part
    const targetBeacon = document.createElement("div");
    targetBeacon.className = "target-beacon";
    targetBeacon.style.cssText =
      "position:absolute;left:0;top:0;display:none;pointer-events:none;will-change:transform;z-index:7;";
    targetBeacon.innerHTML = `
      <div class="beacon-reticle">
        <span class="beacon-corner tl"></span>
        <span class="beacon-corner tr"></span>
        <span class="beacon-corner bl"></span>
        <span class="beacon-corner br"></span>
        <span class="beacon-center-dot"></span>
        <span class="beacon-ring-pulse"></span>
      </div>
      <div class="beacon-hud-card">
        <span class="beacon-tag-icon">⌖</span>
        <div class="beacon-text-group">
          <strong class="beacon-part-title">COMPONENT</strong>
          <small class="beacon-part-category">DETACHABLE</small>
        </div>
      </div>
    `;

    root.append(svg, ring, label, cursor, targetBeacon);
    this.container.appendChild(root);

    this.overlay = {
      root,
      line,
      leaderPath,
      startCircle,
      endCircle,
      targetBeacon,
      cursor,
      ring,
      label,
      nameEl,
      stateEl,
      pinchShown: false,
      labelKey: "",
    };
  }

  _hideTarget() {
    const o = this.overlay;
    o.ring.style.display = "none";
    o.line.style.display = "none";
    o.label.style.display = "none";
  }

  setupLighting() {
    const hemisphere = new THREE.HemisphereLight(0xc6e7ff, 0x1b2636, 1.8);
    this.scene.add(hemisphere);

    const key = new THREE.DirectionalLight(0xffffff, 3.1);
    key.position.set(6, 10, 8);
    key.castShadow = false;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xb9d8ff, 1.35);
    fill.position.set(-7, 4, 5);
    this.scene.add(fill);

    const cyanRim = new THREE.DirectionalLight(0x63dfff, 1.7);
    cyanRim.position.set(-6, 5, -7);
    this.scene.add(cyanRim);

    const softRim = new THREE.DirectionalLight(0x8ca8ff, 0.9);
    softRim.position.set(7, 3, -6);
    this.scene.add(softRim);

    const groundBounce = new THREE.PointLight(0x4dcfff, 0.7, 12);
    groundBounce.position.set(0, 0.35, 0);
    this.scene.add(groundBounce);
  }

  setupEnvironment() {
    this.pedestal = null;
  }

  disposeObject(object) {
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    object.traverse((child) => {
      if (child.geometry) geometries.add(child.geometry);
      if (child.material) {
        const materialList = Array.isArray(child.material)
          ? child.material
          : [child.material];
        materialList.forEach((material) => {
          materials.add(material);
          Object.values(material).forEach((value) => {
            if (value?.isTexture) textures.add(value);
          });
        });
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
  }

  loadModelData(modelData) {
    if (this.currentModelRoot) {
      const previousRoot = this.currentModelRoot;
      this.scene.remove(previousRoot);
      this.disposeObject(previousRoot);
    }

    this.endTwoHandZoom();
    this.zoomTargetDistance = null;
    this._releaseGLBPart();
    this.partHover = null;
    this.partWasPinching = false;
    this.disposeExplosionParticles();

    this.currentModelRoot = modelData.root;
    this.currentParts = modelData.parts || [];
    this.currentParts.forEach((part) => {
      part._manualOffset = new THREE.Vector3();
      part._dismantleBasePosition = new THREE.Vector3();
    });
    this.currentModelRoot.position.set(0, 0, 0);
    this.currentModelRoot.rotation.set(0, 0, 0);
    this.scene.add(this.currentModelRoot);

    const bounds = modelData.bounds
      ? modelData.bounds.clone()
      : new THREE.Box3().setFromObject(this.currentModelRoot);
    if (!bounds.isEmpty()) {
      const sphere = bounds.getBoundingSphere(new THREE.Sphere());
      this.modelTarget.copy(sphere.center);
      this.modelRadius = Math.max(sphere.radius, 1.1);
    } else {
      this.modelTarget.set(0, 0, 0);
      this.modelRadius = 2.2;
    }

    let maxOffset = 0;
    this.currentParts.forEach((part) => {
      if (part.explodeOffset) {
        maxOffset = Math.max(maxOffset, part.explodeOffset.length());
      }
    });
    this.explodedRadius =
      this.modelRadius +
      maxOffset * this.baseSpreadScale * this.spreadMultiplier;

    this.controls.target.copy(this.modelTarget);
    this.fitCameraToModel();
  }

  fitCameraToModel() {
    const fovRadians = THREE.MathUtils.degToRad(this.camera.fov);
    const distance = Math.max(
      (this.modelRadius / Math.sin(fovRadians / 2)) * 1.08,
      5.2,
    );
    const direction = new THREE.Vector3(1.05, 0.58, 1.25).normalize();
    this.camera.position
      .copy(this.modelTarget)
      .addScaledVector(direction, distance);
    this.camera.near = Math.max(0.03, distance / 220);
    this.camera.far = Math.max(120, distance * 14);
    this.camera.updateProjectionMatrix();
    this.controls.minDistance = Math.max(1.2, this.modelRadius * 0.4);
    this.controls.maxDistance = Math.max(
      35,
      distance * 4,
      this.explodedRadius * 10,
    );

    this.controls.target.copy(this.modelTarget);
    this.controls.update();
    this.isTransitioningCamera = false;
  }

  // ======================================================================
  // HAND ROTATION
  // ======================================================================

  applyHandRotation(rotation, opennessFactor, isHandPresent, dt = 0.016) {
    if (!this.currentModelRoot) return;
    if (this.zoomActive) return;

    if (isHandPresent && rotation) {
      this.isHandControllingRotation = true;
      const roll = THREE.MathUtils.clamp(rotation.roll || 0, -1.35, 1.35);
      const yaw = THREE.MathUtils.clamp(rotation.yaw || 0, -0.9, 0.9);
      const targetY = THREE.MathUtils.clamp(
        roll * 3.4 + yaw * 2.5,
        -2.75,
        2.75,
      );
      const targetX = THREE.MathUtils.clamp(-yaw * 0.95, -0.9, 0.9);
      const targetZ = THREE.MathUtils.clamp(-roll * 0.78, -1.05, 1.05);
      const alpha = 1 - Math.exp(-12.5 * dt);
      this.currentModelRoot.rotation.y = THREE.MathUtils.lerp(
        this.currentModelRoot.rotation.y,
        targetY,
        alpha,
      );
      this.currentModelRoot.rotation.x = THREE.MathUtils.lerp(
        this.currentModelRoot.rotation.x,
        targetX,
        alpha,
      );
      this.currentModelRoot.rotation.z = THREE.MathUtils.lerp(
        this.currentModelRoot.rotation.z,
        targetZ,
        alpha,
      );
    } else {
      this.isHandControllingRotation = false;
    }
  }

  setMouseMode(mode) {
    this.mouseMode = mode;
    if (mode === "orbit") {
      this.controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
      this.controls.touches = {
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN,
      };
    } else {
      this.controls.mouseButtons = {
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE,
      };
      this.controls.touches = {
        ONE: THREE.TOUCH.PAN,
        TWO: THREE.TOUCH.DOLLY_PAN,
      };
    }
  }

  // ======================================================================
  // TWO-HAND ZOOM
  // ======================================================================

  updateTwoHandZoom(handDistance) {
    if (!(handDistance > 0)) return;
    if (!this.zoomActive) this.beginTwoHandZoom(handDistance);

    const ratio =
      this.zoomStartHandDistance / Math.max(handDistance, MIN_HAND_DISTANCE);
    const target =
      this.zoomStartCamDistance * Math.pow(ratio, this.zoomSensitivity);

    this.zoomTargetDistance = THREE.MathUtils.clamp(
      target,
      this.controls.minDistance,
      this.controls.maxDistance,
    );
  }

  beginTwoHandZoom(handDistance) {
    if (!(handDistance > 0)) return;
    this.isTransitioningCamera = false;
    this.zoomActive = true;
    this.zoomStartHandDistance = Math.max(handDistance, MIN_HAND_DISTANCE);
    this.zoomStartCamDistance = this.camera.position.distanceTo(
      this.controls.target,
    );
    this.zoomTargetDistance = this.zoomStartCamDistance;
  }

  endTwoHandZoom() {
    this.zoomActive = false;
  }

  _stepZoom(dt) {
    if (this.zoomTargetDistance === null) return;

    const offset = this._offsetVec
      .copy(this.camera.position)
      .sub(this.controls.target);
    const current = offset.length();
    if (current < 1e-4) {
      this.zoomTargetDistance = null;
      return;
    }

    const alpha = 1 - Math.exp(-this.zoomSmoothing * dt);
    let next = current * Math.pow(this.zoomTargetDistance / current, alpha);

    const settled = Math.abs(next - this.zoomTargetDistance) < 0.004;
    if (settled) next = this.zoomTargetDistance;

    offset.setLength(next);
    this.camera.position.copy(this.controls.target).add(offset);

    if (settled && !this.zoomActive) this.zoomTargetDistance = null;
  }

  // ======================================================================
  // DISMANTLE
  // ======================================================================

  /**
   * @param {number} factor        0 = assembled, 1 = fully dismantled
   * @param {object|null} handRotation  { roll, yaw } or null
   * @param {number} dt            frame delta in seconds
   */
  updateDismantle(factor, handRotation = null, dt = 0.016) {
    const value = THREE.MathUtils.clamp(factor, 0, 1);
    const progress = value * value * (3 - 2 * value);
    this._stepPointer(dt);

    if (!this.currentParts.length) {
      this._updatePartPointerOverlay();
      return;
    }

    if (progress <= 0.02) {
      this._releaseGLBPart();
      this.partHover = null;
      this.currentParts.forEach((part) => part._manualOffset?.set(0, 0, 0));
    }

    const spread = this.spreadMultiplier * this.baseSpreadScale;
    const effectiveSpread = spread * progress;
    const rotAmount = spread * progress;
    const spinAngle = handRotation
      ? (THREE.MathUtils.clamp(handRotation.roll, -1.2, 1.2) * 0.65 +
          handRotation.yaw * 0.45) *
        progress
      : 0;

    const pivotA = this._pivotA;
    const pivotB = this._pivotB;
    const euler = this._euler;

    this.currentParts.forEach((part, index) => {
      if (!part._baseQuat) {
        part._baseQuat = new THREE.Quaternion().setFromEuler(part.originalRot);
        part._offsetQuat = new THREE.Quaternion();
        part._spinQuat = new THREE.Quaternion();
        part._finalQuat = new THREE.Quaternion();
        part._spinAxis = part.explodeOffset.clone();
        if (part._spinAxis.lengthSq() < 0.001) {
          part._spinAxis.copy(UP_VECTOR);
        }
        part._spinAxis.normalize();
      }

      let finalQuat = part._finalQuat.copy(part._baseQuat);

      if (part.explodeRotOffset) {
        euler.set(
          part.explodeRotOffset.x * rotAmount,
          part.explodeRotOffset.y * rotAmount,
          part.explodeRotOffset.z * rotAmount,
        );
        part._offsetQuat.setFromEuler(euler);
        finalQuat.premultiply(part._offsetQuat);
      }

      if (spinAngle !== 0) {
        part._spinQuat.setFromAxisAngle(
          part._spinAxis,
          spinAngle * (index % 2 ? -1 : 1),
        );
        finalQuat.premultiply(part._spinQuat);
      }

      part.object.quaternion.copy(finalQuat);
      part.object.position
        .copy(part.originalPos)
        .addScaledVector(part.explodeOffset, effectiveSpread);

      const pivot = part.pivot || ZERO_VECTOR;
      if (pivot !== ZERO_VECTOR) {
        pivotA.copy(pivot).applyQuaternion(part._baseQuat);
        pivotB.copy(pivot).applyQuaternion(finalQuat);
        part.object.position.add(pivotA).sub(pivotB);
      }

      if (!part._dismantleBasePosition) {
        part._dismantleBasePosition = new THREE.Vector3();
      }
      part._dismantleBasePosition.copy(part.object.position);
      if (part._manualOffset && progress > 0.02) {
        part.object.position.addScaledVector(part._manualOffset, progress);
      }
    });

    this.currentModelRoot?.updateMatrixWorld(true);
    this._updatePartInteraction(dt, progress);
  }

  // ======================================================================
  // CAMERA HELPERS
  // ======================================================================

  setPresetView(viewName) {
    const radius = Math.max(this.modelRadius, 1.2);
    const distance = Math.max(radius * 2.8, 6.5);
    const directions = {
      isometric: new THREE.Vector3(1.05, 0.58, 1.25),
      front: new THREE.Vector3(0, 0.12, 1.8),
      top: new THREE.Vector3(0.01, 2.15, 0.01),
      side: new THREE.Vector3(1.9, 0.12, 0),
      explode: new THREE.Vector3(1.05, 0.82, 1.35),
      reset: new THREE.Vector3(1.05, 0.58, 1.25),
    };
    const direction = directions[viewName];
    if (!direction) return;
    this.zoomTargetDistance = null;
    this.targetCamPos
      .copy(this.modelTarget)
      .addScaledVector(direction.normalize(), distance);
    this.targetControlsTarget.copy(this.modelTarget);
    this.isTransitioningCamera = true;
  }

  focusOnPart(part, card = null) {
    if (!part) {
      this.clearFocusedPart();
      return;
    }
    this.focusedPart = part;
    this.focusedCard = card;

    const worldPosition = new THREE.Vector3();
    part.object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(part.object);
    if (!box.isEmpty()) {
      box.getCenter(worldPosition);
    } else {
      part.object.getWorldPosition(worldPosition);
    }

    this.zoomTargetDistance = null;
    this.targetControlsTarget.copy(worldPosition);
    const direction = new THREE.Vector3(1.1, 0.72, 1.45).normalize();
    this.targetCamPos
      .copy(worldPosition)
      .addScaledVector(direction, Math.max(this.modelRadius * 1.35, 3.8));
    this.isTransitioningCamera = true;

    this._pulsePartMesh(part);
  }

  clearFocusedPart() {
    this.focusedPart = null;
    this.focusedCard = null;
    if (this.overlay) {
      this.overlay.leaderPath.style.display = "none";
      this.overlay.startCircle.style.display = "none";
      this.overlay.endCircle.style.display = "none";
      this.overlay.targetBeacon.style.display = "none";
    }
  }

  _pulsePartMesh(part) {
    if (!part?.object) return;
    const meshes = [];
    part.object.traverse((child) => {
      if (child.isMesh && child.material) {
        meshes.push(child);
      }
    });

    meshes.forEach((mesh) => {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((mat) => {
        if ("emissive" in mat && !mat._origEmissive) {
          mat._origEmissive = mat.emissive.getHex();
          mat._origIntensity = mat.emissiveIntensity || 0;
          mat.emissive.setHex(0x00f0ff);
          mat.emissiveIntensity = 1.4;
          setTimeout(() => {
            mat.emissive.setHex(mat._origEmissive);
            mat.emissiveIntensity = mat._origIntensity;
            delete mat._origEmissive;
            delete mat._origIntensity;
          }, 850);
        }
      });
    });
  }

  _updateFocusedPartLeaderLine() {
    const o = this.overlay;
    if (!o) return;
    if (!this.focusedPart || !this.focusedPart.object) {
      o.leaderPath.style.display = "none";
      o.startCircle.style.display = "none";
      o.endCircle.style.display = "none";
      o.targetBeacon.style.display = "none";
      return;
    }

    this.currentModelRoot?.updateMatrixWorld(true);
    this.camera.updateMatrixWorld();

    const worldPos = new THREE.Vector3();
    const box = new THREE.Box3().setFromObject(this.focusedPart.object);
    if (!box.isEmpty()) {
      box.getCenter(worldPos);
    } else {
      this.focusedPart.object.getWorldPosition(worldPos);
    }

    const cameraForward = this.camera.getWorldDirection(new THREE.Vector3());
    const depth = worldPos.clone().sub(this.camera.position).dot(cameraForward);
    if (depth <= 0) {
      o.leaderPath.style.display = "none";
      o.startCircle.style.display = "none";
      o.endCircle.style.display = "none";
      o.targetBeacon.style.display = "none";
      return;
    }

    const projected = worldPos.clone().project(this.camera);
    const tx = (projected.x * 0.5 + 0.5) * this.width;
    const ty = (-projected.y * 0.5 + 0.5) * this.height;

    let sx = tx - 120;
    let sy = ty - 80;
    let isLeft = true;

    if (this.focusedCard && this.focusedCard.offsetParent !== null) {
      const cardRect = this.focusedCard.getBoundingClientRect();
      const containerRect = this.container.getBoundingClientRect();
      isLeft = cardRect.left + cardRect.width / 2 < this.width / 2;
      sx = (isLeft ? cardRect.right + 2 : cardRect.left - 2) - containerRect.left;
      sy = cardRect.top + cardRect.height / 2 - containerRect.top;
    } else {
      const mobileCallout = document.querySelector(".mobile-callout-card");
      if (mobileCallout && mobileCallout.style.display !== "none") {
        const mRect = mobileCallout.getBoundingClientRect();
        const containerRect = this.container.getBoundingClientRect();
        sx = mRect.left + mRect.width / 2 - containerRect.left;
        sy = mRect.bottom + 2 - containerRect.top;
        isLeft = sx < tx;
      } else {
        isLeft = tx > this.width / 2;
        sx = isLeft ? Math.max(25, tx - 140) : Math.min(this.width - 25, tx + 140);
        sy = Math.max(80, Math.min(this.height - 120, ty - 60));
      }
    }

    const elbowX = isLeft ? Math.max(sx + 35, (sx + tx) * 0.5) : Math.min(sx - 35, (sx + tx) * 0.5);
    const pathD = `M ${sx.toFixed(1)} ${sy.toFixed(1)} L ${elbowX.toFixed(1)} ${sy.toFixed(1)} L ${tx.toFixed(1)} ${ty.toFixed(1)}`;

    const partColor = this.focusedPart.colorHex || "#00d2ff";
    o.leaderPath.setAttribute("d", pathD);
    o.leaderPath.setAttribute("stroke", partColor);
    o.leaderPath.style.display = "block";

    o.startCircle.setAttribute("cx", sx.toFixed(1));
    o.startCircle.setAttribute("cy", sy.toFixed(1));
    o.startCircle.setAttribute("fill", partColor);
    o.startCircle.style.display = "block";

    o.endCircle.setAttribute("cx", tx.toFixed(1));
    o.endCircle.setAttribute("cy", ty.toFixed(1));
    o.endCircle.style.display = "block";

    o.targetBeacon.style.display = "block";
    o.targetBeacon.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) translate(-50%, -50%)`;
    o.targetBeacon.style.setProperty("--part-color", partColor);

    const titleEl = o.targetBeacon.querySelector(".beacon-part-title");
    const catEl = o.targetBeacon.querySelector(".beacon-part-category");
    if (titleEl) titleEl.textContent = this.focusedPart.partName || "Component";
    if (catEl) catEl.textContent = this.focusedPart.category || "Part";
  }

  onWindowResize = () => {
    this.width = this.container.clientWidth || window.innerWidth;
    this.height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  };

  render(dt = 0.016) {
    dt = Math.min(dt, 0.1);

    if (this.isTransitioningCamera && !this.zoomActive) {
      const alpha = 1 - Math.exp(-7.5 * dt);
      this.camera.position.lerp(this.targetCamPos, alpha);
      this.controls.target.lerp(this.targetControlsTarget, alpha);
      if (this.camera.position.distanceTo(this.targetCamPos) < 0.035) {
        this.camera.position.copy(this.targetCamPos);
        this.controls.target.copy(this.targetControlsTarget);
        this.isTransitioningCamera = false;
      }
    }

    this._stepZoom(dt);

    if (
      this.autoRotate &&
      !this.isHandControllingRotation &&
      !this.isInteracting &&
      !this.isTransitioningCamera &&
      !this.zoomActive &&
      this.currentModelRoot
    ) {
      this.currentModelRoot.rotation.y += 0.22 * dt;
    }

    this._updateFocusedPartLeaderLine();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.resizeObserver) this.resizeObserver.disconnect();
    window.removeEventListener("resize", this.onWindowResize);
    this.controls.dispose();
    if (this.currentModelRoot) this.disposeObject(this.currentModelRoot);
    this.disposeExplosionParticles();
    this.overlay?.root.remove();
    this.overlay = null;
    this.renderer.dispose();
    this.container.innerHTML = "";
  }
}
