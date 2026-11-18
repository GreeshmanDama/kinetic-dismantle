# Kinetic Dismantle

> An interactive 3D exploded-view studio powered by Three.js and MediaPipe hand tracking.

Kinetic Dismantle lets you interact with 3D models using natural hand gestures. Open your palm to separate model components, close your hand to reassemble them, and rotate the model by moving or tilting your hand.

The application also supports mouse controls, manual dismantling, component inspection, and custom `.glb` / `.gltf` model importing.

---

## ✨ Features

- 🖐️ **Real-time hand tracking**
  - Powered by MediaPipe Hands
  - Live hand landmark visualization
  - Open-palm and closed-fist gesture detection

- 💥 **Interactive exploded view**
  - Open your hand to dismantle the model
  - Close your hand to reassemble it
  - Smooth component transitions

- 🔄 **Hand-controlled rotation**
  - Move and tilt your hand to rotate the 3D model
  - Smooth rotational response

- 🖱️ **Mouse controls**
  - Left drag — orbit / rotate
  - Scroll — zoom
  - Right drag — pan

- 🎛️ **Manual dismantle control**
  - Use the separation slider when a camera is not available
  - Useful for testing and demonstrations

- 📦 **Custom 3D model import**
  - Import `.glb`
  - Import `.gltf`
  - Self-contained `.glb` files are recommended

- 🔍 **Component inspection**
  - Displays detected model components
  - Allows individual component inspection
  - Shows component information in the interface

- 🏗️ **GLB / GLTF support**
  - Existing 3D models can be loaded directly
  - Original world transforms are preserved

- 📷 **Restart-safe camera**
  - Camera can be stopped and restarted safely
  - A fresh MediaPipe instance is created for every camera session
  - Media streams are properly cleaned up

- 🎨 **Professional 3D interface**
  - Dark visualization-studio UI
  - Floating controls
  - Model selection
  - Camera status
  - Telemetry
  - View controls

---

# Install Dependencies

```text
npm install
```

# Run Project

```text
npm run dev
```

# 🖥️ Project Structure

```text
kinetic-dismantle-updated/
│
├── index.html
├── server.mjs
├── README.md
│
├── models/
|   ├── human_heart.glb
|   ├── korean_building.glb
|   ├── porche.glb
|   └── robo_dog.glb
└── src/
    ├── audio.js
    ├── handTracker.js
    ├── labels.js
    ├── main.js
    ├── models.js
    ├── scene.js
    └── style.css