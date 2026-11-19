/**
 * Lightweight, clickable component labels docked around the 3D viewport.
 * Supports active part selection, visual pointing, and mobile callout presentation.
 */
export class LabelManager {
  constructor(container, camera) {
    this.container = container;
    this.camera = camera;
    this.items = [];
    this.visible = true;
    this.selectedPart = null;
    this.selectedCard = null;
    this.onSelectPart = null;

    this.leftRack = document.createElement("div");
    this.leftRack.className = "labels-side-rack rack-left";
    this.rightRack = document.createElement("div");
    this.rightRack.className = "labels-side-rack rack-right";

    // Mobile floating callout badge when side racks are hidden
    this.mobileCallout = document.createElement("div");
    this.mobileCallout.className = "mobile-callout-card";
    this.mobileCallout.style.display = "none";
    this.mobileCallout.innerHTML = `
      <span class="callout-tag-dot"></span>
      <div class="callout-meta">
        <span class="callout-title"></span>
        <span class="callout-cat"></span>
      </div>
      <button type="button" class="callout-close" aria-label="Deselect component">×</button>
    `;
    this.mobileCallout
      .querySelector(".callout-close")
      .addEventListener("click", (e) => {
        e.stopPropagation();
        this.clearSelection();
      });

    this.container.append(this.leftRack, this.rightRack, this.mobileCallout);
  }

  setParts(parts) {
    this.clear();
    parts.forEach((part, index) => {
      const isLeft =
        part.originalPos.x < 0 ||
        (index % 2 === 0 && Math.abs(part.originalPos.x) < 0.05);
      const card = document.createElement("button");
      card.type = "button";
      card.className = `side-callout-card ${isLeft ? "card-left" : "card-right"}`;
      card.style.setProperty("--part-color", part.colorHex || "#55dfff");
      card.dataset.partName = part.partName || `Component ${index + 1}`;

      const indicator = document.createElement("span");
      indicator.className = "card-indicator";
      const content = document.createElement("span");
      content.className = "card-content";
      const name = document.createElement("span");
      name.className = "card-part-name";
      name.textContent = part.partName || `Component ${index + 1}`;
      const category = document.createElement("span");
      category.className = "card-category";
      category.textContent = part.category || "Component";
      content.append(name, category);
      card.append(indicator, content);

      card.addEventListener("click", (event) => {
        event.stopPropagation();
        this.selectPart(part);
        this.onSelectPart?.(part, card);
      });

      (isLeft ? this.leftRack : this.rightRack).appendChild(card);
      this.items.push({ part, card });
    });
    this.applyVisibility();
  }

  selectPart(part) {
    this.selectedPart = part;
    this.items.forEach(({ part: p, card }) => {
      const isMatch = p === part;
      card.classList.toggle("active-pointed", isMatch);
      if (isMatch) {
        this.selectedCard = card;
        card.style.opacity = "1";
        card.style.pointerEvents = "auto";
        card.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });

    if (part) {
      // Update mobile floating callout
      this.mobileCallout.style.setProperty(
        "--part-color",
        part.colorHex || "#55dfff",
      );
      this.mobileCallout.querySelector(".callout-tag-dot").style.background =
        part.colorHex || "#55dfff";
      this.mobileCallout.querySelector(".callout-title").textContent =
        part.partName || "Component";
      this.mobileCallout.querySelector(".callout-cat").textContent =
        part.category || "Detachable component";

      // Show callout on mobile or if side racks are hidden/narrow
      if (window.innerWidth <= 840) {
        this.mobileCallout.style.display = "flex";
      }
    } else {
      this.mobileCallout.style.display = "none";
    }

    return this.selectedCard;
  }

  clearSelection() {
    this.selectedPart = null;
    this.selectedCard = null;
    this.items.forEach(({ card }) => {
      card.classList.remove("active-pointed");
    });
    this.mobileCallout.style.display = "none";
    if (this.onSelectPart) {
      this.onSelectPart(null, null);
    }
  }

  clear() {
    this.leftRack.replaceChildren();
    this.rightRack.replaceChildren();
    this.mobileCallout.style.display = "none";
    this.items = [];
    this.selectedPart = null;
    this.selectedCard = null;
  }

  applyVisibility() {
    this.container.style.display = this.visible ? "block" : "none";
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
    const baseOpacity = Math.max(0, Math.min(1, (opennessFactor - 0.12) / 0.3));

    this.items.forEach(({ part, card }) => {
      const isSelected = part === this.selectedPart;
      if (isSelected) {
        card.style.opacity = "1";
        card.style.pointerEvents = "auto";
      } else {
        card.style.opacity = baseOpacity.toFixed(2);
        card.style.pointerEvents = baseOpacity > 0.35 ? "auto" : "none";
      }
    });
  }
}
