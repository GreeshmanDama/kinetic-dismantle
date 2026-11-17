# Kinetic Dismantle — updated build

A Three.js exploded-view studio with MediaPipe hand tracking, a restart-safe camera lifecycle, component inspection, and custom GLB/GLTF import.

## Project structure

```text
kinetic-dismantle-updated/
├── index.html
├── server.mjs
└── src/
    ├── audio.js
    ├── handTracker.js
    ├── labels.js
    ├── main.js
    ├── models.js
    ├── scene.js
    └── style.css
```

## Run it

1. Install Node.js 18 or newer.
2. Open a terminal in this folder.
3. Run:

   ```bash
   node server.mjs
   ```

4. Open `http://localhost:3000` in Chrome or Edge.
5. Allow camera access when prompted.

The page loads Three.js, MediaPipe Hands, and Google Fonts from their CDNs, so an internet connection is required. Webcam access works on `localhost` or an HTTPS deployment; opening `index.html` directly with `file://` is not supported.

## Controls

- Open palm: separate the model components.
- Closed fist: assemble the model.
- Move/tilt the hand: rotate the model.
- Manual control slider: test separation without a camera.
- Drag: orbit; scroll: zoom; right-drag: pan.
- Import: load a `.glb` or `.gltf` file. A self-contained `.glb` is the easiest format to import.

## GLB component limitation

The importer finds every static mesh node and preserves its original world transform while making it independently movable. If an asset contains a single combined mesh, the app cannot infer real wheels, doors, panels, or other semantic parts from the surface. It displays a warning and treats the asset as one component. For a true exploded view, export the desired pieces as separate objects/meshes from Blender or another 3D editor.

Skinned/rigged assets are kept together as one assembly so their bone hierarchy is not broken.

## Camera restart fix

The tracking module no longer uses the MediaPipe `Camera` helper. It owns one `getUserMedia()` stream and a guarded requestAnimationFrame loop; stopping invalidates pending callbacks, closes the active `Hands` instance, stops every media track, detaches the video, and clears the overlay. Starting creates a fresh `Hands` instance and frame loop.
