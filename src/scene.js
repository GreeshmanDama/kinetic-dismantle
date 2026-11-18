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

    // Explosion particles
    this.particlesEnabled = true;
    this.explosionParticles = null;
    this.particleBase = null; // immutable rest positions (never written to after creation)
    this.particleVelocities = null;
    this.particleCount = 90;

    this.scene = new THREE.Scene();
    // Transparent clear lets the carefully tuned CSS studio gradient show through.
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
    // The viewport has no ground plane; disabling shadow maps saves GPU time
    // on dense imported CAD, vehicle and scan models.
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
    this.mouseMode = "drag";
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    this.controls.touches = {
      ONE: THREE.TOUCH.PAN,
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

    // ---- Two-hand zoom state -------------------------------------------
    // Zoom is "absolute": the camera distance follows the ratio between the
    // hand separation when the gesture started and the current separation.
    // It works the same whether the model is assembled or dismantled.
    this.zoomActive = false;
    this.zoomSensitivity = 1.5; // >1 = a small hand movement zooms more
    this.zoomSmoothing = 9; // higher = snappier, lower = silkier
    this.zoomStartHandDistance = 0;
    this.zoomStartCamDistance = 0;
    this.zoomTargetDistance = null;

    // Reusable temporaries (no per-frame allocations)
    this._offsetVec = new THREE.Vector3();
    this._pivotA = new THREE.Vector3();
    this._pivotB = new THREE.Vector3();
    this._euler = new THREE.Euler();

    this.resizeObserver = new ResizeObserver(() => this.onWindowResize());
    this.resizeObserver.observe(container);
    window.addEventListener("resize", this.onWindowResize);
  }

  // ======================================================================
  // PARTICLES
  // ======================================================================

  createExplosionParticles() {
    this.disposeExplosionParticles();

    const count = this.particleCount;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.4 + Math.random() * 2.2;
      const height = (Math.random() - 0.5) * 2.2;

      positions[i3] = Math.cos(angle) * radius;
      positions[i3 + 1] = height;
      positions[i3 + 2] = Math.sin(angle) * radius;

      velocities[i3] = Math.cos(angle) * (0.25 + Math.random() * 0.5);
      velocities[i3 + 1] = (Math.random() - 0.5) * 0.45;
      velocities[i3 + 2] = Math.sin(angle) * (0.25 + Math.random() * 0.5);
    }

    // FIX: the GPU attribute gets its OWN copy of the array. Previously the
    // attribute array and the "base" array were the same Float32Array, so each
    // frame the base positions were overwritten and then re-scaled again,
    // compounding exponentially.
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions.slice(), 3),
    );

    const material = new THREE.PointsMaterial({
      color: 0x65dfff,
      size: 0.035,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    this.explosionParticles = new THREE.Points(geometry, material);
    this.explosionParticles.visible = false;
    // Positions change every frame, so the initial bounding sphere is stale.
    this.explosionParticles.frustumCulled = false;
    // Centre the cloud on the model and scale it with the model's size.
    this.explosionParticles.position.copy(this.modelTarget);
    this.explosionParticles.scale.setScalar(Math.max(this.modelRadius / 2.2, 0.5));
    this.scene.add(this.explosionParticles);

    this.particleBase = positions;
    this.particleVelocities = velocities;
  }

  updateExplosionParticles(factor, dt = 0.016) {
    if (!this.explosionParticles || !this.particleBase) return;

    const value = THREE.MathUtils.clamp(factor, 0, 1);

    if (value <= 0.02) {
      this.explosionParticles.visible = false;
      return;
    }

    const attribute = this.explosionParticles.geometry.attributes.position;
    const positions = attribute.array;
    const base = this.particleBase;
    const velocities = this.particleVelocities;
    const radial = 0.25 + value * 1.8;

    for (let i = 0; i < positions.length; i++) {
      positions[i] = base[i] * radial + velocities[i] * value;
    }

    // FIX: needsUpdate must be set on the BufferAttribute, not on the raw
    // typed array (that flag was silently ignored, so nothing re-uploaded).
    attribute.needsUpdate = true;

    this.explosionParticles.visible = true;
    this.explosionParticles.rotation.y += dt * 0.15 * value;
    this.explosionParticles.material.opacity = THREE.MathUtils.clamp(
      value * 1.5,
      0,
      0.75,
    );
  }

  disposeExplosionParticles() {
    if (!this.explosionParticles) return;

    this.scene.remove(this.explosionParticles);
    this.explosionParticles.geometry.dispose();
    this.explosionParticles.material.dispose();
    this.explosionParticles = null;
    this.particleBase = null;
    this.particleVelocities = null;
  }

  // ======================================================================
  // SCENE SETUP
  // ======================================================================

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
    // Intentionally no floor, ground plane, grid or pedestal. The model floats
    // cleanly against the CSS studio gradient, so no part appears to intersect
    // an artificial surface.
    this.pedestal = null;
    this.particles = null;
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
      // Release the previous model before the new one is rendered. This avoids
      // briefly keeping two large GLBs' GPU resources alive at the same time.
      this.disposeObject(previousRoot);
    }

    // A new model must never inherit a half-finished zoom gesture.
    this.endTwoHandZoom();
    this.zoomTargetDistance = null;

    this.currentModelRoot = modelData.root;
    this.currentParts = modelData.parts || [];
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

    // How far the farthest part travels when fully dismantled. Used so the
    // zoom limits always allow the whole exploded model to fit on screen.
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

    if (this.particlesEnabled) this.createExplosionParticles();
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

    // Zoom limits scale with the model so dismantled models can be zoomed out
    // far enough to see every part, and zoomed in without clipping inside.
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

    // While zooming with two hands the model's orientation is frozen so the
    // zoom gesture never twists the model.
    if (this.zoomActive) return;

    if (isHandPresent && rotation) {
      this.isHandControllingRotation = true;
      const targetY = rotation.roll * 1.65 + rotation.yaw * 1.25;
      const targetX = -rotation.yaw * 0.25;
      const targetZ = -rotation.roll * 0.22;
      const alpha = 1 - Math.exp(-9 * dt);
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

  /**
   * Call with the current distance between the two hands every time the
   * tracker reports `twoHand.active`. The first call starts the gesture.
   * It only moves the camera, never touches the dismantle state, so it works
   * identically when the model is assembled or exploded.
   */
  updateTwoHandZoom(handDistance) {
    if (!(handDistance > 0)) return;
    if (!this.zoomActive) this.beginTwoHandZoom(handDistance);

    const ratio =
      this.zoomStartHandDistance / Math.max(handDistance, MIN_HAND_DISTANCE);
    // Hands apart  -> ratio < 1 -> camera moves closer (zoom in)
    // Hands closer -> ratio > 1 -> camera moves away  (zoom out)
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
    // A running camera preset transition would fight the zoom.
    this.isTransitioningCamera = false;
    this.zoomActive = true;
    this.zoomStartHandDistance = Math.max(handDistance, MIN_HAND_DISTANCE);
    this.zoomStartCamDistance = this.camera.position.distanceTo(
      this.controls.target,
    );
    this.zoomTargetDistance = this.zoomStartCamDistance;
  }

  /** The camera keeps gliding to its last target after this, then stops. */
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

    // Interpolate in log-space so zooming in and out feel equally fast.
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

    // FIX: a single smoothstep. Previously the value was smoothed twice
    // (manual smoothstep + MathUtils.smoothstep) on top of the tracker's own
    // smoothing, which made the start/end of the motion feel laggy.
    const progress = value * value * (3 - 2 * value);

    this.updateExplosionParticles(progress, dt);

    if (!this.currentParts.length) return;

    const spread = this.spreadMultiplier * this.baseSpreadScale;
    const effectiveSpread = spread * progress;
    const rotAmount = spread * progress;

    // FIX: no hard `value > 0.12` switch (it caused a visible pop). The spin
    // already scales with `progress`, so it fades in on its own.
    const spinAngle = handRotation
      ? (THREE.MathUtils.clamp(handRotation.roll, -1.2, 1.2) * 0.65 +
          handRotation.yaw * 0.45) *
        progress
      : 0;

    const pivotA = this._pivotA;
    const pivotB = this._pivotB;
    const euler = this._euler;

    this.currentParts.forEach((part, index) => {
      // Lazily created, cached per part.
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

      // ---- Rotation (all rotations are in the model's parent space) ------
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

      // FIX: the spin axis is expressed in parent space, so the spin must be
      // PRE-multiplied. Post-multiplying rotated it around a local axis.
      if (spinAngle !== 0) {
        part._spinQuat.setFromAxisAngle(
          part._spinAxis,
          spinAngle * (index % 2 ? -1 : 1),
        );
        finalQuat.premultiply(part._spinQuat);
      }

      part.object.quaternion.copy(finalQuat);

      // ---- Position -------------------------------------------------------
      // FIX: rotate each part around its own centre instead of the group
      // origin. The procedural models keep every group at (0,0,0) with the
      // meshes offset inside it, so rotating the group used to swing the part
      // around the model origin instead of spinning it in place.
      part.object.position
        .copy(part.originalPos)
        .addScaledVector(part.explodeOffset, effectiveSpread);

      const pivot = part.pivot || ZERO_VECTOR;
      if (pivot !== ZERO_VECTOR) {
        pivotA.copy(pivot).applyQuaternion(part._baseQuat);
        pivotB.copy(pivot).applyQuaternion(finalQuat);
        part.object.position.add(pivotA).sub(pivotB);
      }
    });
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

  focusOnPart(part) {
    const worldPosition = new THREE.Vector3();
    part.object.getWorldPosition(worldPosition);
    this.zoomTargetDistance = null;
    this.targetControlsTarget.copy(worldPosition);
    const direction = new THREE.Vector3(1.1, 0.72, 1.45).normalize();
    this.targetCamPos
      .copy(worldPosition)
      .addScaledVector(direction, Math.max(this.modelRadius * 1.45, 4));
    this.isTransitioningCamera = true;
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
    // A long frame (tab switch, GC pause) must not cause a camera jump.
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

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.resizeObserver) this.resizeObserver.disconnect();
    window.removeEventListener("resize", this.onWindowResize);
    this.controls.dispose();
    if (this.currentModelRoot) this.disposeObject(this.currentModelRoot);
    this.disposeExplosionParticles();
    this.renderer.dispose();
    this.container.innerHTML = "";
  }
}