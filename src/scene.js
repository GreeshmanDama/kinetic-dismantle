import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export class SceneManager {
  constructor(container) {
    this.container = container;
    this.width = container.clientWidth || window.innerWidth;
    this.height = container.clientHeight || window.innerHeight;
    this.explosionParticles = null;
    this.particlePositions = null;
    this.particleVelocities = null;
    this.particleCount = 90;
    this.particleProgress = 0;

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
    this.twoHandZoomVelocity = 0;
    this.autoRotate = true;
    this.isHandControllingRotation = false;
    this.isTransitioningCamera = false;
    this.targetCamPos = new THREE.Vector3();
    this.targetControlsTarget = new THREE.Vector3();

    this.resizeObserver = new ResizeObserver(() => this.onWindowResize());
    this.resizeObserver.observe(container);
    window.addEventListener("resize", this.onWindowResize);
  }

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

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

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

    this.scene.add(this.explosionParticles);

    this.particlePositions = positions;

    this.particleVelocities = velocities;
  }

  updateExplosionParticles(factor, dt = 0.016) {
    if (!this.explosionParticles) {
      return;
    }

    const value = THREE.MathUtils.clamp(factor, 0, 1);

    const positions =
      this.explosionParticles.geometry.attributes.position.array;

    const velocities = this.particleVelocities;

    for (let i = 0; i < this.particleCount; i++) {
      const i3 = i * 3;

      const baseX = this.particlePositions[i3];

      const baseY = this.particlePositions[i3 + 1];

      const baseZ = this.particlePositions[i3 + 2];

      positions[i3] = baseX * (0.25 + value * 1.8);

      positions[i3 + 1] = baseY * (0.25 + value * 1.8);

      positions[i3 + 2] = baseZ * (0.25 + value * 1.8);

      positions[i3] += velocities[i3] * value;

      positions[i3 + 1] += velocities[i3 + 1] * value;

      positions[i3 + 2] += velocities[i3 + 2] * value;
    }

    positions.needsUpdate = true;

    this.explosionParticles.visible = value > 0.08;

    this.explosionParticles.material.opacity = THREE.MathUtils.clamp(
      value * 1.5,
      0,
      0.75,
    );
  }

  disposeExplosionParticles() {
    if (!this.explosionParticles) {
      return;
    }

    this.scene.remove(this.explosionParticles);

    this.explosionParticles.geometry.dispose();

    this.explosionParticles.material.dispose();

    this.explosionParticles = null;
    this.particlePositions = null;
    this.particleVelocities = null;
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

    this.currentModelRoot = modelData.root;
    this.currentParts = modelData.parts || [];
    this.currentModelRoot.position.set(0, 0, 0);
    this.currentModelRoot.rotation.set(0, 0, 0);
    this.scene.add(this.currentModelRoot);

    // Custom GLB import already computed normalized bounds. Reuse them instead
    // of walking every vertex-bearing node a second time.
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

    this.controls.target.copy(this.modelTarget);
    this.fitCameraToModel();
    // this.createExplosionParticles();
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
    this.controls.target.copy(this.modelTarget);
    this.controls.update();
    this.isTransitioningCamera = false;
  }

  applyHandRotation(rotation, opennessFactor, isHandPresent, dt = 0.016) {
    if (!this.currentModelRoot) return;
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

  applyTwoHandZoom(zoomDelta, dt = 0.016) {
    if (Math.abs(zoomDelta) > 0.00012) {
      this.twoHandZoomVelocity += zoomDelta * 4.8;
    }
    if (Math.abs(this.twoHandZoomVelocity) > 0.0001) {
      const offset = this.camera.position.clone().sub(this.controls.target);
      const currentDist = offset.length();
      // zoomDelta > 0 means hands spread apart -> zoom in (factor < 1, camera distance decreases)
      // zoomDelta < 0 means hands brought together -> zoom out (factor > 1, camera distance increases)
      const factor = 1 - this.twoHandZoomVelocity * dt * 7.2;
      const newDist = THREE.MathUtils.clamp(
        currentDist * factor,
        this.controls.minDistance,
        this.controls.maxDistance,
      );
      offset.setLength(newDist);
      this.camera.position.copy(this.controls.target).add(offset);
      this.controls.update();
      this.twoHandZoomVelocity *= Math.exp(-8.5 * dt);
    }
  }

  updateDismantle(factor, handRotation = null) {
    if (!this.currentParts.length) return;

    const value = THREE.MathUtils.clamp(factor, 0, 1);

    /*
     * Smoother explosion curve.
     */
    const eased = value * value * (3 - 2 * value);

    /*
     * Additional smoothing near the beginning/end.
     */
    const explosionProgress = THREE.MathUtils.smoothstep(eased, 0, 1);

    const effectiveSpread =
      this.spreadMultiplier * this.baseSpreadScale * explosionProgress;

    const rotSpread = this.spreadMultiplier * this.baseSpreadScale;

    this.currentParts.forEach((part, index) => {
      part._offset ||= new THREE.Vector3();

      part._baseQuaternion ||= new THREE.Quaternion();

      part._explodedQuaternion ||= new THREE.Quaternion();

      part._spinQuaternion ||= new THREE.Quaternion();

      part._axis ||= new THREE.Vector3();

      part._euler ||= new THREE.Euler();

      // ========================================================
      // POSITION
      // ========================================================

      part._offset.copy(part.explodeOffset).multiplyScalar(effectiveSpread);

      part.object.position.copy(part.originalPos).add(part._offset);

      // ========================================================
      // ROTATION
      // ========================================================

      part._baseQuaternion.setFromEuler(part.originalRot);

      if (part.explodeRotOffset) {
        part._euler.set(
          part.originalRot.x + part.explodeRotOffset.x * rotSpread,

          part.originalRot.y + part.explodeRotOffset.y * rotSpread,

          part.originalRot.z + part.explodeRotOffset.z * rotSpread,
        );

        part._explodedQuaternion.setFromEuler(part._euler);

        part._baseQuaternion.slerp(part._explodedQuaternion, explosionProgress);
      }

      // ========================================================
      // HAND CONTROLLED SPIN
      // ========================================================

      if (handRotation && value > 0.12) {
        part._axis.copy(part.explodeOffset);

        if (part._axis.lengthSq() < 0.001) {
          part._axis.set(0, 1, 0);
        }

        part._axis.normalize();

        const spin =
          (handRotation.roll * 0.65 + handRotation.yaw * 0.45) *
          explosionProgress;

        part._spinQuaternion.setFromAxisAngle(
          part._axis,
          spin * (index % 2 ? -1 : 1),
        );

        part._baseQuaternion.multiply(part._spinQuaternion);
      }

      part.object.quaternion.copy(part._baseQuaternion);
    });
  }

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
    this.targetCamPos
      .copy(this.modelTarget)
      .addScaledVector(direction.normalize(), distance);
    this.targetControlsTarget.copy(this.modelTarget);
    this.isTransitioningCamera = true;
  }

  focusOnPart(part) {
    const worldPosition = new THREE.Vector3();
    part.object.getWorldPosition(worldPosition);
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
    if (this.isTransitioningCamera) {
      const alpha = 1 - Math.exp(-7.5 * dt);
      this.camera.position.lerp(this.targetCamPos, alpha);
      this.controls.target.lerp(this.targetControlsTarget, alpha);
      if (this.camera.position.distanceTo(this.targetCamPos) < 0.035) {
        this.camera.position.copy(this.targetCamPos);
        this.controls.target.copy(this.targetControlsTarget);
        this.isTransitioningCamera = false;
      }
    }

    if (
      this.autoRotate &&
      !this.isHandControllingRotation &&
      !this.isInteracting &&
      !this.isTransitioningCamera &&
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
    this.renderer.dispose();
    this.disposeExplosionParticles();
    this.container.innerHTML = "";
  }
}
