/** Lightweight, clickable component labels docked around the 3D viewport. */
export class LabelManager {
  constructor(container, camera) {
    this.container = container;
    this.camera = camera;
    this.items = [];
    this.visible = true;
    this.onSelectPart = null;

    this.leftRack = document.createElement('div');
    this.leftRack.className = 'labels-side-rack rack-left';
    this.rightRack = document.createElement('div');
    this.rightRack.className = 'labels-side-rack rack-right';
    this.container.append(this.leftRack, this.rightRack);
  }

  setParts(parts) {
    this.clear();
    parts.forEach((part, index) => {
      const isLeft = part.originalPos.x < 0 || (index % 2 === 0 && Math.abs(part.originalPos.x) < 0.05);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `side-callout-card ${isLeft ? 'card-left' : 'card-right'}`;
      card.style.setProperty('--part-color', part.colorHex || '#55dfff');

      const indicator = document.createElement('span');
      indicator.className = 'card-indicator';
      const content = document.createElement('span');
      content.className = 'card-content';
      const name = document.createElement('span');
      name.className = 'card-part-name';
      name.textContent = part.partName || `Component ${index + 1}`;
      const category = document.createElement('span');
      category.className = 'card-category';
      category.textContent = part.category || 'Component';
      content.append(name, category);
      card.append(indicator, content);
      card.addEventListener('click', event => {
        event.stopPropagation();
        this.onSelectPart?.(part);
      });
      (isLeft ? this.leftRack : this.rightRack).appendChild(card);
      this.items.push({ part, card });
    });
    this.applyVisibility();
  }

  clear() {
    this.leftRack.replaceChildren();
    this.rightRack.replaceChildren();
    this.items = [];
  }

  applyVisibility() {
    this.container.style.display = this.visible ? 'block' : 'none';
  }

  toggleVisibility() {
    this.visible = !this.visible;
    this.applyVisibility();
    return this.visible;
  }

  setVisibility(visible) {
    this.visible = Boolean(visible);
    this.applyVisibility();
    return this.visible;
  }

  update(opennessFactor) {
    if (!this.visible || !this.items.length) return;
    const opacity = Math.max(0, Math.min(1, (opennessFactor - 0.14) / 0.3));
    this.items.forEach(({ card }) => {
      card.style.opacity = opacity.toFixed(2);
      card.style.pointerEvents = opacity > 0.38 ? 'auto' : 'none';
    });
  }
}
