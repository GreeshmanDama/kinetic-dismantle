import * as THREE from 'three';

/**
 * Helper to create materials with PBR properties
 */
function createMaterials() {
  return {
    carPaint: new THREE.MeshPhysicalMaterial({
      color: 0x00d2ff,
      metalness: 0.85,
      roughness: 0.18,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      reflectivity: 0.9
    }),
    carbonFiber: new THREE.MeshStandardMaterial({
      color: 0x181a1f,
      roughness: 0.45,
      metalness: 0.7
    }),
    engineMetal: new THREE.MeshStandardMaterial({
      color: 0x8a929e,
      metalness: 0.92,
      roughness: 0.25
    }),
    chrome: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.98,
      roughness: 0.05
    }),
    glowCyan: new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00f0ff,
      emissiveIntensity: 2.5,
      roughness: 0.2
    }),
    glowMagenta: new THREE.MeshStandardMaterial({
      color: 0xff0055,
      emissive: 0xff0055,
      emissiveIntensity: 3.0,
      roughness: 0.2
    }),
    glowOrange: new THREE.MeshStandardMaterial({
      color: 0xff6600,
      emissive: 0xff6600,
      emissiveIntensity: 2.8,
      roughness: 0.2
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x223344,
      metalness: 0.1,
      roughness: 0.05,
      transmission: 0.88,
      thickness: 0.4,
      transparent: true,
      opacity: 0.7
    }),
    rubber: new THREE.MeshStandardMaterial({
      color: 0x111317,
      roughness: 0.85,
      metalness: 0.1
    }),
    goldBrake: new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      metalness: 0.9,
      roughness: 0.3
    }),
    jetMetal: new THREE.MeshStandardMaterial({
      color: 0x3d434d,
      metalness: 0.75,
      roughness: 0.35
    })
  };
}

/**
 * Helper to wrap a component with explosion vectors and metadata
 */
function createPart(groupOrMesh, name, category, colorHex, explodeOffset, explodeRotOffset = new THREE.Euler(0, 0, 0)) {
  groupOrMesh.traverse(child => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return {
    object: groupOrMesh,
    partName: name,
    category: category,
    colorHex: colorHex,
    originalPos: groupOrMesh.position.clone(),
    originalRot: groupOrMesh.rotation.clone(),
    explodeOffset: explodeOffset.clone(),
    explodeRotOffset: explodeRotOffset.clone()
  };
}

/**
 * Helper to create a wheel assembly (Rotor + Caliper + Rim + Tire)
 */
function createWheelAssembly(mats, isLeft = true) {
  const wheelGroup = new THREE.Group();

  // Tire
  const tireGeo = new THREE.TorusGeometry(0.68, 0.24, 16, 32);
  const tire = new THREE.Mesh(tireGeo, mats.rubber);
  tire.rotation.y = Math.PI / 2;
  wheelGroup.add(tire);

  // Wheel Rim
  const rimGeo = new THREE.CylinderGeometry(0.66, 0.66, 0.38, 24);
  const rim = new THREE.Mesh(rimGeo, mats.chrome);
  rim.rotation.z = Math.PI / 2;
  wheelGroup.add(rim);

  // Rim Spokes
  for (let i = 0; i < 5; i++) {
    const spokeGeo = new THREE.BoxGeometry(0.12, 1.15, 0.06);
    const spoke = new THREE.Mesh(spokeGeo, mats.carbonFiber);
    spoke.rotation.x = (i * Math.PI) / 2.5;
    wheelGroup.add(spoke);
  }

  // Carbon Ceramic Brake Rotor
  const rotorGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.08, 24);
  const rotor = new THREE.Mesh(rotorGeo, mats.engineMetal);
  rotor.rotation.z = Math.PI / 2;
  rotor.position.x = isLeft ? -0.1 : 0.1;
  wheelGroup.add(rotor);

  // Gold Caliper
  const caliperGeo = new THREE.BoxGeometry(0.14, 0.28, 0.2);
  const caliper = new THREE.Mesh(caliperGeo, mats.goldBrake);
  caliper.position.set(isLeft ? -0.1 : 0.1, 0.36, 0);
  wheelGroup.add(caliper);

  return wheelGroup;
}

// ============================================================================
// MODEL 1: SUPERCAR (CYBER APEX V8)
// ============================================================================
export function buildCarModel() {
  const mats = createMaterials();
  const root = new THREE.Group();
  root.name = 'CyberSupercar';
  const parts = [];

  // 1. Lower Chassis & Battery Skateboard Base
  const chassisGroup = new THREE.Group();
  const chassisBase = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.25, 4.4), mats.carbonFiber);
  chassisBase.position.y = 0.3;
  chassisGroup.add(chassisBase);
  parts.push(createPart(
    chassisGroup,
    'Carbon Monocoque Chassis',
    'Structure',
    '#00f0ff',
    new THREE.Vector3(0, -1.2, 0)
  ));

  // 2. Cockpit Interior & Carbon Bucket Seats
  const cockpitGroup = new THREE.Group();
  const seatL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.6), mats.carbonFiber);
  seatL.position.set(-0.45, 0.7, -0.1);
  const seatR = seatL.clone();
  seatR.position.x = 0.45;
  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.6), mats.carbonFiber);
  dash.position.set(0, 0.8, 0.7);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.25), mats.glowCyan);
  screen.position.set(0, 0.95, 0.85);
  screen.rotation.x = -Math.PI / 6;
  cockpitGroup.add(seatL, seatR, dash, screen);
  parts.push(createPart(
    cockpitGroup,
    'Cockpit & Telemetry Dash',
    'Interior',
    '#94a3b8',
    new THREE.Vector3(0, 1.8, 0)
  ));

  // 3. V8 Twin-Turbo Engine Block
  const engineGroup = new THREE.Group();
  const engineBlock = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 1.1), mats.engineMetal);
  engineBlock.position.set(0, 0.7, -1.0);
  // Twin turbo manifolds
  const turboL = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.1, 12, 24), mats.goldBrake);
  turboL.position.set(-0.65, 0.85, -1.0);
  turboL.rotation.y = Math.PI / 2;
  const turboR = turboL.clone();
  turboR.position.x = 0.65;
  // Glowing cylinder heads
  const heads = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.15, 0.8), mats.glowOrange);
  heads.position.set(0, 1.1, -1.0);
  engineGroup.add(engineBlock, turboL, turboR, heads);
  parts.push(createPart(
    engineGroup,
    'V8 Twin-Turbocharged Powertrain',
    'Powertrain',
    '#ffaa00',
    new THREE.Vector3(0, 3.2, -0.6),
    new THREE.Euler(0.2, 0, 0)
  ));

  // 4. Main Bodywork / Outer Shell
  const bodyGroup = new THREE.Group();
  const mainShell = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.6, 4.3), mats.carPaint);
  mainShell.position.set(0, 0.65, 0);
  bodyGroup.add(mainShell);
  parts.push(createPart(
    bodyGroup,
    'Aerodynamic Composite Body',
    'Bodywork',
    '#00d2ff',
    new THREE.Vector3(0, 2.2, 0)
  ));

  // 5. Aerodynamic Front Hood / Bonnet
  const hoodGroup = new THREE.Group();
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.15, 1.5), mats.carPaint);
  hood.position.set(0, 0.95, 1.35);
  hood.rotation.x = -0.15;
  hoodGroup.add(hood);
  parts.push(createPart(
    hoodGroup,
    'Vented Carbon Bonnet',
    'Aerodynamics',
    '#00d2ff',
    new THREE.Vector3(0, 1.6, 2.5),
    new THREE.Euler(-0.35, 0, 0)
  ));

  // 6. Glass Windshield & Roof Canopy
  const canopyGroup = new THREE.Group();
  const glassRoof = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 2.0), mats.glass);
  glassRoof.position.set(0, 1.25, 0.1);
  canopyGroup.add(glassRoof);
  parts.push(createPart(
    canopyGroup,
    'Panoramic Solar Canopy',
    'Glass',
    '#223344',
    new THREE.Vector3(0, 3.8, 0.3),
    new THREE.Euler(0.1, 0, 0)
  ));

  // 7. Left Dihedral Butterfly Door
  const doorLGroup = new THREE.Group();
  const doorL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.8, 1.6), mats.carPaint);
  doorL.position.set(-1.08, 0.85, 0.1);
  doorLGroup.add(doorL);
  parts.push(createPart(
    doorLGroup,
    'Left Dihedral Door',
    'Doors',
    '#00d2ff',
    new THREE.Vector3(-2.8, 2.2, 0.2),
    new THREE.Euler(0, 0, -0.6)
  ));

  // 8. Right Dihedral Butterfly Door
  const doorRGroup = new THREE.Group();
  const doorR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.8, 1.6), mats.carPaint);
  doorR.position.set(1.08, 0.85, 0.1);
  doorRGroup.add(doorR);
  parts.push(createPart(
    doorRGroup,
    'Right Dihedral Door',
    'Doors',
    '#00d2ff',
    new THREE.Vector3(2.8, 2.2, 0.2),
    new THREE.Euler(0, 0, 0.6)
  ));

  // 9. Front Bumper & Carbon Splitter
  const frontBumperGroup = new THREE.Group();
  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.45, 0.5), mats.carbonFiber);
  bumperF.position.set(0, 0.45, 2.25);
  // Headlights
  const lightL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.1), mats.glowCyan);
  lightL.position.set(-0.75, 0.55, 2.45);
  const lightR = lightL.clone();
  lightR.position.x = 0.75;
  frontBumperGroup.add(bumperF, lightL, lightR);
  parts.push(createPart(
    frontBumperGroup,
    'Front Splitter & Matrix LED',
    'Aerodynamics',
    '#00f0ff',
    new THREE.Vector3(0, 0.2, 3.8)
  ));

  // 10. Rear Aero Diffuser & Titanium Exhausts
  const rearDiffuserGroup = new THREE.Group();
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.45, 0.5), mats.carbonFiber);
  diffuser.position.set(0, 0.45, -2.25);
  const exhaustL = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 16), mats.glowMagenta);
  exhaustL.rotation.x = Math.PI / 2;
  exhaustL.position.set(-0.35, 0.48, -2.4);
  const exhaustR = exhaustL.clone();
  exhaustR.position.x = 0.35;
  rearDiffuserGroup.add(diffuser, exhaustL, exhaustR);
  parts.push(createPart(
    rearDiffuserGroup,
    'Rear Diffuser & Dual Exhausts',
    'Exhaust',
    '#ff007f',
    new THREE.Vector3(0, -0.2, -3.8)
  ));

  // 11. Rear GT Carbon Wing / Spoiler
  const wingGroup = new THREE.Group();
  const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.5), mats.carbonFiber);
  wingBlade.position.set(0, 1.45, -2.0);
  const wingPillarL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.2), mats.chrome);
  wingPillarL.position.set(-0.6, 1.2, -1.95);
  const wingPillarR = wingPillarL.clone();
  wingPillarR.position.x = 0.6;
  wingGroup.add(wingBlade, wingPillarL, wingPillarR);
  parts.push(createPart(
    wingGroup,
    'Active Aero Downforce Wing',
    'Aerodynamics',
    '#181a1f',
    new THREE.Vector3(0, 2.6, -2.8),
    new THREE.Euler(-0.3, 0, 0)
  ));

  // 12. Front Left Wheel Assembly
  const wheelFL = createWheelAssembly(mats, true);
  wheelFL.position.set(-1.15, 0.45, 1.4);
  parts.push(createPart(
    wheelFL,
    'Front-Left 21" Forged Wheel',
    'Chassis',
    '#ffffff',
    new THREE.Vector3(-3.2, 0, 1.4),
    new THREE.Euler(0, 0.6, 0)
  ));

  // 13. Front Right Wheel Assembly
  const wheelFR = createWheelAssembly(mats, false);
  wheelFR.position.set(1.15, 0.45, 1.4);
  parts.push(createPart(
    wheelFR,
    'Front-Right 21" Forged Wheel',
    'Chassis',
    '#ffffff',
    new THREE.Vector3(3.2, 0, 1.4),
    new THREE.Euler(0, -0.6, 0)
  ));

  // 14. Rear Left Wheel Assembly
  const wheelRL = createWheelAssembly(mats, true);
  wheelRL.position.set(-1.18, 0.45, -1.4);
  parts.push(createPart(
    wheelRL,
    'Rear-Left 22" Ultra-Wide Wheel',
    'Chassis',
    '#ffffff',
    new THREE.Vector3(-3.4, 0, -1.4)
  ));

  // 15. Rear Right Wheel Assembly
  const wheelRR = createWheelAssembly(mats, false);
  wheelRR.position.set(1.18, 0.45, -1.4);
  parts.push(createPart(
    wheelRR,
    'Rear-Right 22" Ultra-Wide Wheel',
    'Chassis',
    '#ffffff',
    new THREE.Vector3(3.4, 0, -1.4)
  ));

  // Add all parts to root
  parts.forEach(p => root.add(p.object));

  return { root, parts, displayName: 'CYBER APEX V8', baseScale: 1.0 };
}

// ============================================================================
// MODEL 2: SUPERSONIC JET FIGHTER (AERO RAPTOR X)
// ============================================================================
export function buildAirplaneModel() {
  const mats = createMaterials();
  const root = new THREE.Group();
  root.name = 'SupersonicJet';
  const parts = [];

  // 1. Central Fuselage Core Body
  const fuselageGroup = new THREE.Group();
  const fuselageGeo = new THREE.CylinderGeometry(0.7, 0.9, 6.0, 16);
  const fuselage = new THREE.Mesh(fuselageGeo, mats.jetMetal);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.set(0, 0.9, 0);
  fuselageGroup.add(fuselage);
  parts.push(createPart(
    fuselageGroup,
    'Titanium Airframe Fuselage',
    'Airframe',
    '#3d434d',
    new THREE.Vector3(0, 0, 0)
  ));

  // 2. Stealth Radome Nose Cone
  const noseGroup = new THREE.Group();
  const noseGeo = new THREE.ConeGeometry(0.68, 2.2, 16);
  const nose = new THREE.Mesh(noseGeo, mats.carbonFiber);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0.9, 4.1);
  const pitotTube = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 8), mats.chrome);
  pitotTube.rotation.x = Math.PI / 2;
  pitotTube.position.set(0, 0.9, 5.4);
  noseGroup.add(nose, pitotTube);
  parts.push(createPart(
    noseGroup,
    'AESA Radar Nose Radome',
    'Avionics',
    '#00f0ff',
    new THREE.Vector3(0, 0.3, 4.5)
  ));

  // 3. Cockpit Pilot Seat & HUD Console
  const cockpitSeatGroup = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.6), mats.carbonFiber);
  seat.position.set(0, 1.35, 1.5);
  const hud = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.25), mats.glowCyan);
  hud.position.set(0, 1.55, 2.0);
  hud.rotation.x = -Math.PI / 4;
  cockpitSeatGroup.add(seat, hud);
  parts.push(createPart(
    cockpitSeatGroup,
    'Zero-Zero Ejection Seat & HUD',
    'Cockpit',
    '#00ff88',
    new THREE.Vector3(0, 2.0, 1.5)
  ));

  // 4. Cockpit Acrylic Canopy
  const canopyGroup = new THREE.Group();
  const canopyGeo = new THREE.CylinderGeometry(0.45, 0.6, 2.4, 12, 1, false, 0, Math.PI);
  const canopy = new THREE.Mesh(canopyGeo, mats.glass);
  canopy.rotation.x = Math.PI / 2;
  canopy.rotation.y = Math.PI;
  canopy.position.set(0, 1.55, 1.6);
  canopyGroup.add(canopy);
  parts.push(createPart(
    canopyGroup,
    'Gold-Coated Stealth Canopy',
    'Cockpit',
    '#ffaa00',
    new THREE.Vector3(0, 3.5, 1.8),
    new THREE.Euler(-0.4, 0, 0)
  ));

  // 5. Port (Left) Variable Delta Wing
  const leftWingGroup = new THREE.Group();
  const wingShapeL = new THREE.Shape();
  wingShapeL.moveTo(0, 0);
  wingShapeL.lineTo(3.8, -1.8);
  wingShapeL.lineTo(3.2, -2.6);
  wingShapeL.lineTo(0, -1.5);
  wingShapeL.closePath();
  const wingGeoL = new THREE.ExtrudeGeometry(wingShapeL, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.04 });
  const wingL = new THREE.Mesh(wingGeoL, mats.jetMetal);
  wingL.rotation.x = Math.PI / 2;
  wingL.rotation.z = Math.PI;
  wingL.position.set(-0.6, 0.9, 0.8);
  leftWingGroup.add(wingL);
  parts.push(createPart(
    leftWingGroup,
    'Port Variable Delta Wing',
    'Aerodynamics',
    '#3d434d',
    new THREE.Vector3(-4.5, 0.8, -0.5),
    new THREE.Euler(0, 0, 0.3)
  ));

  // 6. Starboard (Right) Variable Delta Wing
  const rightWingGroup = new THREE.Group();
  const wingShapeR = new THREE.Shape();
  wingShapeR.moveTo(0, 0);
  wingShapeR.lineTo(-3.8, -1.8);
  wingShapeR.lineTo(-3.2, -2.6);
  wingShapeR.lineTo(0, -1.5);
  wingShapeR.closePath();
  const wingGeoR = new THREE.ExtrudeGeometry(wingShapeR, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.04 });
  const wingR = new THREE.Mesh(wingGeoR, mats.jetMetal);
  wingR.rotation.x = Math.PI / 2;
  wingR.rotation.z = Math.PI;
  wingR.position.set(0.6, 0.9, 0.8);
  rightWingGroup.add(wingR);
  parts.push(createPart(
    rightWingGroup,
    'Starboard Variable Delta Wing',
    'Aerodynamics',
    '#3d434d',
    new THREE.Vector3(4.5, 0.8, -0.5),
    new THREE.Euler(0, 0, -0.3)
  ));

  // 7. Left Jet Turbofan Engine & Afterburner
  const engineLGroup = new THREE.Group();
  const engineGeo = new THREE.CylinderGeometry(0.42, 0.45, 2.6, 16);
  const engBodyL = new THREE.Mesh(engineGeo, mats.engineMetal);
  engBodyL.rotation.x = Math.PI / 2;
  engBodyL.position.set(-0.75, 0.85, -2.0);
  const burnerL = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.4, 16), mats.glowOrange);
  burnerL.position.set(-0.75, 0.85, -3.32);
  engineLGroup.add(engBodyL, burnerL);
  parts.push(createPart(
    engineLGroup,
    'Left Turbofan & Afterburner',
    'Propulsion',
    '#ff6600',
    new THREE.Vector3(-2.2, 0.2, -3.8)
  ));

  // 8. Right Jet Turbofan Engine & Afterburner
  const engineRGroup = new THREE.Group();
  const engBodyR = new THREE.Mesh(engineGeo, mats.engineMetal);
  engBodyR.rotation.x = Math.PI / 2;
  engBodyR.position.set(0.75, 0.85, -2.0);
  const burnerR = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.4, 16), mats.glowOrange);
  burnerR.position.set(0.75, 0.85, -3.32);
  engineRGroup.add(engBodyR, burnerR);
  parts.push(createPart(
    engineRGroup,
    'Right Turbofan & Afterburner',
    'Propulsion',
    '#ff6600',
    new THREE.Vector3(2.2, 0.2, -3.8)
  ));

  // 9. Twin Vertical Cant Stabilizers (Tail Fins)
  const tailGroup = new THREE.Group();
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.lineTo(0.5, 1.8);
  finShape.lineTo(1.4, 1.8);
  finShape.lineTo(1.8, 0);
  finShape.closePath();
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.1, bevelEnabled: false });
  const finL = new THREE.Mesh(finGeo, mats.jetMetal);
  finL.position.set(-0.8, 1.2, -2.4);
  finL.rotation.z = -0.25;
  const finR = finL.clone();
  finR.position.x = 0.8;
  finR.rotation.z = 0.25;
  tailGroup.add(finL, finR);
  parts.push(createPart(
    tailGroup,
    'Twin Cant Vertical Stabilizers',
    'Empennage',
    '#3d434d',
    new THREE.Vector3(0, 3.2, -2.2)
  ));

  // 10. Port All-Moving Tailplane / Elevator
  const elevatorLGroup = new THREE.Group();
  const elevGeo = new THREE.BoxGeometry(1.4, 0.08, 0.9);
  const elevL = new THREE.Mesh(elevGeo, mats.jetMetal);
  elevL.position.set(-1.4, 0.85, -2.8);
  elevL.rotation.y = 0.2;
  elevatorLGroup.add(elevL);
  parts.push(createPart(
    elevatorLGroup,
    'Port Horizontal Stabilator',
    'Empennage',
    '#94a3b8',
    new THREE.Vector3(-2.8, -0.6, -4.0),
    new THREE.Euler(-0.3, 0, 0)
  ));

  // 11. Starboard All-Moving Tailplane / Elevator
  const elevatorRGroup = new THREE.Group();
  const elevR = new THREE.Mesh(elevGeo, mats.jetMetal);
  elevR.position.set(1.4, 0.85, -2.8);
  elevR.rotation.y = -0.2;
  elevatorRGroup.add(elevR);
  parts.push(createPart(
    elevatorRGroup,
    'Starboard Horizontal Stabilator',
    'Empennage',
    '#94a3b8',
    new THREE.Vector3(2.8, -0.6, -4.0),
    new THREE.Euler(-0.3, 0, 0)
  ));

  // 12. Left Hypersonic Guided Missile
  const missileLGroup = new THREE.Group();
  const missileGeo = new THREE.CylinderGeometry(0.1, 0.1, 1.8, 12);
  const missileL = new THREE.Mesh(missileGeo, mats.chrome);
  missileL.rotation.x = Math.PI / 2;
  missileL.position.set(-2.4, 0.65, -0.3);
  missileLGroup.add(missileL);
  parts.push(createPart(
    missileLGroup,
    'Port Hypersonic AIM-X Missile',
    'Payload',
    '#ff0055',
    new THREE.Vector3(-3.8, -1.8, 0)
  ));

  // 13. Right Hypersonic Guided Missile
  const missileRGroup = new THREE.Group();
  const missileR = missileL.clone();
  missileR.position.x = 2.4;
  missileRGroup.add(missileR);
  parts.push(createPart(
    missileRGroup,
    'Starboard Hypersonic AIM-X Missile',
    'Payload',
    '#ff0055',
    new THREE.Vector3(3.8, -1.8, 0)
  ));

  parts.forEach(p => root.add(p.object));
  return { root, parts, displayName: 'AERO RAPTOR X', baseScale: 0.95 };
}

// ============================================================================
// MODEL 3: FUTURISTIC CYBER BIKE (NEO-CYCLE 2099)
// ============================================================================
export function buildBikeModel() {
  const mats = createMaterials();
  const root = new THREE.Group();
  root.name = 'CyberBike';
  const parts = [];

  // 1. Central Core Monocoque Frame
  const frameGroup = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 2.2), mats.carbonFiber);
  frame.position.set(0, 1.1, 0);
  frameGroup.add(frame);
  parts.push(createPart(
    frameGroup,
    'Carbon Monocoque Chassis',
    'Frame',
    '#181a1f',
    new THREE.Vector3(0, 0, 0)
  ));

  // 2. Quantum Battery & Fusion Reactor Cell
  const reactorGroup = new THREE.Group();
  const reactorGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.8, 16);
  const reactor = new THREE.Mesh(reactorGeo, mats.glowCyan);
  reactor.rotation.z = Math.PI / 2;
  reactor.position.set(0, 1.05, -0.1);
  const reactorCage = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.9, 0.9), mats.engineMetal);
  reactorCage.position.set(0, 1.05, -0.1);
  reactorGroup.add(reactor, reactorCage);
  parts.push(createPart(
    reactorGroup,
    'Quantum Fusion Power Core',
    'Power Unit',
    '#00f0ff',
    new THREE.Vector3(0, 2.4, 0),
    new THREE.Euler(0, 0.4, 0)
  ));

  // 3. Ergonomic Racing Seat & Tail Cowl
  const seatGroup = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.25, 1.2), mats.rubber);
  seat.position.set(0, 1.7, -0.6);
  const tailLight = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.08), mats.glowMagenta);
  tailLight.position.set(0, 1.72, -1.22);
  seatGroup.add(seat, tailLight);
  parts.push(createPart(
    seatGroup,
    'Racing Saddle & LED Tail',
    'Bodywork',
    '#ff007f',
    new THREE.Vector3(0, 1.8, -2.4),
    new THREE.Euler(-0.3, 0, 0)
  ));

  // 4. Front Aerodynamic Fairing & Headlight
  const fairingGroup = new THREE.Group();
  const fairing = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 12), mats.carPaint);
  fairing.rotation.x = Math.PI / 2.8;
  fairing.position.set(0, 1.6, 0.9);
  const headlight = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.1), mats.glowCyan);
  headlight.position.set(0, 1.6, 1.48);
  fairingGroup.add(fairing, headlight);
  parts.push(createPart(
    fairingGroup,
    'Aero Fairing & Laser Optics',
    'Fairing',
    '#00d2ff',
    new THREE.Vector3(0, 2.2, 2.5),
    new THREE.Euler(-0.4, 0, 0)
  ));

  // 5. Front Dual-Girder Fork & Handlebars
  const forkGroup = new THREE.Group();
  const forkL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 12), mats.chrome);
  forkL.position.set(-0.35, 1.1, 1.3);
  forkL.rotation.x = -0.4;
  const forkR = forkL.clone();
  forkR.position.x = 0.35;
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 12), mats.chrome);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 1.75, 0.9);
  forkGroup.add(forkL, forkR, bar);
  parts.push(createPart(
    forkGroup,
    'Dual-Girder Telescopic Fork',
    'Steering',
    '#ffffff',
    new THREE.Vector3(0, 1.6, 2.8),
    new THREE.Euler(-0.2, 0, 0)
  ));

  // 6. Front Hubless Wheel Rim
  const wheelFGroup = new THREE.Group();
  const tireF = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.22, 16, 32), mats.rubber);
  tireF.position.set(0, 0.75, 1.8);
  const hublessGlowF = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.06, 16, 32), mats.glowCyan);
  hublessGlowF.position.set(0, 0.75, 1.8);
  wheelFGroup.add(tireF, hublessGlowF);
  parts.push(createPart(
    wheelFGroup,
    'Front Hubless Mag-Lev Wheel',
    'Wheels',
    '#00f0ff',
    new THREE.Vector3(0, 0, 3.8),
    new THREE.Euler(0, 0.4, 0)
  ));

  // 7. Rear Single-Sided Swingarm
  const swingarmGroup = new THREE.Group();
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.4, 1.6), mats.engineMetal);
  arm.position.set(-0.35, 0.8, -1.0);
  arm.rotation.x = 0.2;
  swingarmGroup.add(arm);
  parts.push(createPart(
    swingarmGroup,
    'CNC Billet Swingarm',
    'Suspension',
    '#8a929e',
    new THREE.Vector3(-1.8, 0, -1.8)
  ));

  // 8. Rear Hubless Wheel Rim & Direct Drive Motor
  const wheelRGroup = new THREE.Group();
  const tireR = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.28, 16, 32), mats.rubber);
  tireR.position.set(0, 0.82, -1.8);
  const hublessGlowR = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.08, 16, 32), mats.glowMagenta);
  hublessGlowR.position.set(0, 0.82, -1.8);
  wheelRGroup.add(tireR, hublessGlowR);
  parts.push(createPart(
    wheelRGroup,
    'Rear 300kW Hubless Drive Wheel',
    'Wheels',
    '#ff007f',
    new THREE.Vector3(0, 0, -3.8),
    new THREE.Euler(0, -0.4, 0)
  ));

  // 9. Dual Ion Thrusters / Exhausts
  const thrusterGroup = new THREE.Group();
  const coneL = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 16), mats.glowOrange);
  coneL.rotation.x = -Math.PI / 2;
  coneL.position.set(-0.25, 0.7, -1.6);
  const coneR = coneL.clone();
  coneR.position.x = 0.25;
  thrusterGroup.add(coneL, coneR);
  parts.push(createPart(
    thrusterGroup,
    'Dual Plasma Ion Thrusters',
    'Propulsion',
    '#ffaa00',
    new THREE.Vector3(0, -0.8, -3.2)
  ));

  parts.forEach(p => root.add(p.object));
  return { root, parts, displayName: 'NEO-CYCLE 2099', baseScale: 1.15 };
}

// ============================================================================
// MODEL 4: VTOL RECON DRONE (AEGIS QUAD-7)
// ============================================================================
export function buildDroneModel() {
  const mats = createMaterials();
  const root = new THREE.Group();
  root.name = 'VTOlDrone';
  const parts = [];

  // 1. Central Core Avionics Pod
  const coreGroup = new THREE.Group();
  const pod = new THREE.Mesh(new THREE.DodecahedronGeometry(0.75, 1), mats.carbonFiber);
  pod.position.set(0, 1.0, 0);
  const statusRing = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.05, 12, 32), mats.glowCyan);
  statusRing.rotation.x = Math.PI / 2;
  statusRing.position.set(0, 1.0, 0);
  coreGroup.add(pod, statusRing);
  parts.push(createPart(
    coreGroup,
    'Avionics Core & AI Brain',
    'Avionics',
    '#00f0ff',
    new THREE.Vector3(0, 0, 0)
  ));

  // Helper for Rotor Arm + Motor + Propeller
  function createRotorAssembly(angle, isCW = true) {
    const group = new THREE.Group();
    const length = 2.0;
    const x = Math.cos(angle) * length;
    const z = Math.sin(angle) * length;

    // Carbon Arm
    const armGeo = new THREE.CylinderGeometry(0.08, 0.08, length, 8);
    const arm = new THREE.Mesh(armGeo, mats.carbonFiber);
    arm.position.set(x / 2, 1.0, z / 2);
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x, 0, z).normalize());
    group.add(arm);

    // Motor Nacelle
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.35, 16), mats.engineMetal);
    motor.position.set(x, 1.15, z);
    group.add(motor);

    // Propeller Blades
    const propGeo = new THREE.BoxGeometry(1.6, 0.03, 0.16);
    const prop = new THREE.Mesh(propGeo, mats.chrome);
    prop.position.set(x, 1.35, z);
    prop.rotation.y = angle;
    group.add(prop);

    return { group, endPos: new THREE.Vector3(x, 1.0, z) };
  }

  // 4 Rotor Assemblies
  const rotorAngles = [
    { rad: Math.PI * 0.25, name: 'Front-Right Rotor Pod', dir: new THREE.Vector3(2.5, 1.5, 2.5) },
    { rad: Math.PI * 0.75, name: 'Rear-Right Rotor Pod', dir: new THREE.Vector3(2.5, 1.5, -2.5) },
    { rad: Math.PI * 1.25, name: 'Rear-Left Rotor Pod', dir: new THREE.Vector3(-2.5, 1.5, -2.5) },
    { rad: Math.PI * 1.75, name: 'Front-Left Rotor Pod', dir: new THREE.Vector3(-2.5, 1.5, 2.5) }
  ];

  rotorAngles.forEach((r, idx) => {
    const assembly = createRotorAssembly(r.rad, idx % 2 === 0);
    parts.push(createPart(
      assembly.group,
      r.name,
      'Propulsion',
      '#ffffff',
      r.dir
    ));
  });

  // 4K Optical Gimbal Camera
  const gimbalGroup = new THREE.Group();
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 16), mats.carPaint);
  sphere.position.set(0, 0.45, 0.4);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.1, 16), mats.glowMagenta);
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 0.45, 0.75);
  gimbalGroup.add(sphere, lens);
  parts.push(createPart(
    gimbalGroup,
    '3-Axis Stabilized 4K Camera Turret',
    'Sensors',
    '#ff007f',
    new THREE.Vector3(0, -2.2, 1.8),
    new THREE.Euler(0.4, 0, 0)
  ));

  // Dual Carbon Fiber Landing Skids
  const skidLGroup = new THREE.Group();
  const skidL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 2.4), mats.carbonFiber);
  skidL.position.set(-0.8, 0.2, 0);
  const legL1 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8), mats.carbonFiber);
  legL1.position.set(-0.6, 0.55, 0.6);
  legL1.rotation.z = 0.3;
  const legL2 = legL1.clone();
  legL2.position.z = -0.6;
  skidLGroup.add(skidL, legL1, legL2);
  parts.push(createPart(
    skidLGroup,
    'Port Carbon Landing Gear',
    'Landing Gear',
    '#8a929e',
    new THREE.Vector3(-2.5, -1.8, 0)
  ));

  const skidRGroup = new THREE.Group();
  const skidR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 2.4), mats.carbonFiber);
  skidR.position.set(0.8, 0.2, 0);
  const legR1 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8), mats.carbonFiber);
  legR1.position.set(0.6, 0.55, 0.6);
  legR1.rotation.z = -0.3;
  const legR2 = legR1.clone();
  legR2.position.z = -0.6;
  skidRGroup.add(skidR, legR1, legR2);
  parts.push(createPart(
    skidRGroup,
    'Starboard Carbon Landing Gear',
    'Landing Gear',
    '#8a929e',
    new THREE.Vector3(2.5, -1.8, 0)
  ));

  parts.forEach(p => root.add(p.object));
  return { root, parts, displayName: 'AEGIS QUAD-7', baseScale: 1.25 };
}

/**
 * Builds a dismantle-ready representation of an imported GLB/GLTF.
 * Static mesh nodes are flattened into independent root-level components while
 * preserving each mesh's world transform. A one-mesh model remains usable,
 * but is honestly reported as a single detachable object rather than pretending
 * it has internal parts.
 */
export function processCustomGLTF(gltfScene) {
  if (!gltfScene) {
    throw new Error('The selected GLB/GLTF does not contain a scene.');
  }

  gltfScene.updateMatrixWorld(true);

  const sourceBounds = new THREE.Box3().setFromObject(gltfScene);

  if (sourceBounds.isEmpty()) {
    throw new Error('The selected GLB/GLTF contains no renderable geometry.');
  }

  const size = sourceBounds.getSize(new THREE.Vector3());
  const center = sourceBounds.getCenter(new THREE.Vector3());

  const maxDimension = Math.max(
    size.x,
    size.y,
    size.z
  ) || 1;

  // Normalize every imported model to approximately the same size.
  const scaleFactor = 4.2 / maxDimension;

  const meshNodes = [];
  let containsSkinnedMesh = false;

  gltfScene.traverse(node => {
    if (node.isMesh && node.geometry) {
      meshNodes.push(node);

      if (node.isSkinnedMesh) {
        containsSkinnedMesh = true;
      }
    }
  });

  if (!meshNodes.length) {
    throw new Error('No mesh geometry was found in this GLB/GLTF.');
  }

  const root = new THREE.Group();
  root.name = 'ImportedModelRoot';

  const parts = [];

  // ============================================================
  // SKINNED MODEL
  // ============================================================

  if (containsSkinnedMesh) {
    const normalizedGroup = new THREE.Group();

    normalizedGroup.name = 'SkinnedModelAssembly';

    normalizedGroup.scale.setScalar(scaleFactor);

    normalizedGroup.position
      .copy(center)
      .multiplyScalar(-scaleFactor);

    normalizedGroup.add(gltfScene);

    root.add(normalizedGroup);

    parts.push(
      createPart(
        normalizedGroup,
        gltfScene.name || 'Animated Model Assembly',
        'Skinned Assembly',
        '#65dfff',
        new THREE.Vector3(0, 1.4, 0)
      )
    );

    return {
      root,
      parts,
      displayName:
        gltfScene.name || 'IMPORTED ANIMATED MODEL',

      baseScale: 1,

      diagnostics: {
        meshCount: meshNodes.length,
        partCount: 1,
        isSingleMesh: true,
        isSkinned: true,
        message:
          'This model contains a skeletal rig and is kept together.'
      }
    };
  }

  // ============================================================
  // NORMAL GLB MODEL
  // ============================================================

  const usedNames = new Map();

  /*
   * Calculate normalized component centers first.
   * This allows us to create a much better explosion layout.
   */
  const components = [];

  meshNodes.forEach((sourceMesh, index) => {
    const worldPosition = new THREE.Vector3();
    const worldQuaternion = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();

    sourceMesh.matrixWorld.decompose(
      worldPosition,
      worldQuaternion,
      worldScale
    );

    if (!sourceMesh.geometry.boundingBox) {
      sourceMesh.geometry.computeBoundingBox();
    }

    const localCenter =
      sourceMesh.geometry.boundingBox
        ? sourceMesh.geometry.boundingBox.getCenter(
            new THREE.Vector3()
          )
        : new THREE.Vector3();

    const componentCenter = localCenter
      .applyMatrix4(sourceMesh.matrixWorld)
      .sub(center)
      .multiplyScalar(scaleFactor);

    components.push({
      sourceMesh,
      index,
      worldPosition,
      worldQuaternion,
      worldScale,
      componentCenter
    });
  });

  // ============================================================
  // SORT COMPONENTS
  // ============================================================

  /*
   * Sorting from center → outside gives the explosion a much
   * more organized appearance.
   */
  components.sort((a, b) => {
    return (
      a.componentCenter.lengthSq() -
      b.componentCenter.lengthSq()
    );
  });

  // ============================================================
  // CREATE COMPONENTS
  // ============================================================

  components.forEach((data, sortedIndex) => {
    const {
      sourceMesh,
      index,
      worldPosition,
      worldQuaternion,
      worldScale,
      componentCenter
    } = data;

    const component = sourceMesh.clone(false);

    component.geometry = sourceMesh.geometry;
    component.material = sourceMesh.material;

    component.position.copy(
      worldPosition
        .sub(center)
        .multiplyScalar(scaleFactor)
    );

    component.quaternion.copy(worldQuaternion);

    component.scale
      .copy(worldScale)
      .multiplyScalar(scaleFactor);

    component.matrixAutoUpdate = true;

    component.castShadow = false;
    component.receiveShadow = false;

    // ==========================================================
    // CLEAN COMPONENT NAME
    // ==========================================================

    let componentName =
      (sourceMesh.name || '').trim();

    if (
      !componentName ||
      /^(mesh|object|primitive|node)[_\s-]*\d*$/i.test(
        componentName
      )
    ) {
      let parent = sourceMesh.parent;

      while (
        parent &&
        parent !== gltfScene
      ) {
        const candidate =
          (parent.name || '').trim();

        if (
          candidate &&
          !/^(root|scene|node|object)[_\s-]*\d*$/i.test(
            candidate
          )
        ) {
          componentName = candidate;
          break;
        }

        parent = parent.parent;
      }
    }

    if (!componentName) {
      componentName = `Component ${index + 1}`;
    }

    const duplicateCount =
      (usedNames.get(componentName) || 0) + 1;

    usedNames.set(
      componentName,
      duplicateCount
    );

    if (duplicateCount > 1) {
      componentName =
        `${componentName} ${duplicateCount}`;
    }

    // ==========================================================
    // BETTER EXPLOSION DIRECTION
    // ==========================================================

    const direction =
      componentCenter.clone();

    /*
     * Components near the center need an artificial direction.
     * Otherwise several meshes may move in almost exactly the
     * same direction.
     */
    if (direction.lengthSq() < 0.08) {
      const angle =
        (sortedIndex /
          Math.max(components.length, 1)) *
        Math.PI *
        2;

      direction.set(
        Math.cos(angle),
        ((sortedIndex % 3) - 1) * 0.65,
        Math.sin(angle)
      );
    }

    direction.normalize();

    // ==========================================================
    // CONTROLLED RADIAL DISTANCE
    // ==========================================================

    /*
     * Smaller parts stay closer.
     * Larger/outer parts move farther.
     */
    const distanceFromCenter =
      componentCenter.length();

    const baseDistance = THREE.MathUtils.clamp(
      1.35 +
        distanceFromCenter * 0.45 +
        (sortedIndex % 4) * 0.16,
      1.25,
      3.8
    );

    direction.multiplyScalar(baseDistance);

    // ==========================================================
    // CLEAN VERTICAL DISTRIBUTION
    // ==========================================================

    /*
     * Add a subtle vertical offset so parts don't form a
     * perfectly flat ring.
     */
    const verticalPattern = [
      0.0,
      0.35,
      -0.25,
      0.55,
      -0.45,
      0.2
    ];

    direction.y +=
      verticalPattern[
        sortedIndex % verticalPattern.length
      ];

    // ==========================================================
    // SLIGHT ROTATION
    // ==========================================================

    const rotationStrength =
      0.12 +
      (sortedIndex % 5) * 0.045;

    const rotationOffset =
      new THREE.Euler(
        ((sortedIndex % 2) ? 1 : -1) *
          rotationStrength,

        ((sortedIndex % 3) - 1) *
          rotationStrength,

        ((sortedIndex % 4) - 1.5) *
          rotationStrength
      );

    // ==========================================================
    // ADD TO ROOT
    // ==========================================================

    root.add(component);

    parts.push(
      createPart(
        component,
        componentName,
        'GLB Component',

        sortedIndex % 2 === 0
          ? '#65dfff'
          : '#a4b8ff',

        direction,
        rotationOffset
      )
    );
  });

  // ============================================================
  // FINAL DIAGNOSTICS
  // ============================================================

  const isSingleMesh =
    meshNodes.length === 1;

  return {
    root,
    parts,

    displayName:
      gltfScene.name || 'CUSTOM GLB MODEL',

    baseScale: 1,

    diagnostics: {
      meshCount: meshNodes.length,
      partCount: parts.length,
      isSingleMesh,
      isSkinned: false,

      message: isSingleMesh
        ? 'This file contains one mesh. It moves as a single object.'
        : `Detected ${parts.length} detachable components.`
    }
  };
}

/**
 * Load an existing GLB/GLTF from the public folder.
 *
 * Example:
 * loadGLBModel('/models/car.glb')
 */
export async function loadGLBModel(url) {
  const { GLTFLoader } = await import(
    'three/addons/loaders/GLTFLoader.js'
  );

  const loader = new GLTFLoader();

  const gltf = await new Promise((resolve, reject) => {
    loader.load(
      url,
      resolve,
      undefined,
      reject
    );
  });

  if (!gltf?.scene) {
    throw new Error(`No scene found inside ${url}`);
  }

  return processCustomGLTF(gltf.scene);
}
