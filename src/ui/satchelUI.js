import {
  ITEM_CATALOG,
  countUsedSlots,
  selectInventorySlot,
} from '../player/inventoryLogic.js';

/**
 * Bespoke hand-drawn Alice-in-Wonderland gothic SVG icons for each inventory item.
 */
function renderWonderlandIcon(itemId) {
  if (itemId === 'drink_me') {
    return `
      <svg width="42" height="42" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <rect x="16" y="4" width="8" height="5" rx="1" fill="#8b623b" stroke="#e4d6bd" stroke-width="1.4"/>
        <path d="M16 9 L16 14 L10 22 C8 25 9 33 14 35 L26 35 C31 33 32 25 30 22 L24 14 L24 9" stroke="#e4d6bd" stroke-width="1.6" fill="rgba(165,24,38,0.45)"/>
        <path d="M11 25 C14 23 26 27 29 25 L29 31 C28 33 26 34 24 34 L16 34 C14 34 12 33 11 31 Z" fill="#c92935"/>
        <path d="M23 16 L32 19 L30 24 L21 21 Z" fill="#e6dac1" stroke="#241818" stroke-width="1"/>
      </svg>
    `;
  }
  if (itemId === 'brass_ammo') {
    return `
      <svg width="42" height="42" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <rect x="7" y="15" width="26" height="18" rx="2" fill="#232c22" stroke="#d4a44a" stroke-width="1.6"/>
        <line x1="7" y1="21" x2="33" y2="21" stroke="#d4a44a" stroke-width="1.6"/>
        <path d="M14 15 L14 8 C14 6 17 6 17 8 L17 15" fill="#d4a44a"/>
        <path d="M20 15 L20 8 C20 6 23 6 23 8 L23 15" fill="#d4a44a"/>
        <path d="M26 15 L26 8 C26 6 29 6 29 8 L29 15" fill="#d4a44a"/>
      </svg>
    `;
  }
  if (itemId === 'eat_me') {
    return `
      <svg width="42" height="42" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <ellipse cx="20" cy="30" rx="14" ry="4.5" fill="rgba(222,217,207,0.22)" stroke="#e4d6bd" stroke-width="1.4"/>
        <rect x="12" y="15" width="16" height="13" rx="2" transform="rotate(-6 20 21)" fill="#b8894f" stroke="#efe4ce" stroke-width="1.5"/>
        <circle cx="17" cy="20" r="1.4" fill="#3a1919"/>
        <circle cx="23" cy="22" r="1.4" fill="#3a1919"/>
        <circle cx="20" cy="18" r="1.2" fill="#3a1919"/>
      </svg>
    `;
  }
  // White Rabbit Pocket Watch
  return `
    <svg width="42" height="42" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="9" r="3.5" stroke="#d4a44a" stroke-width="1.6"/>
      <circle cx="20" cy="23" r="11.5" fill="#181414" stroke="#d4a44a" stroke-width="2"/>
      <circle cx="20" cy="23" r="8.5" fill="#efe6d3"/>
      <line x1="20" y1="23" x2="20" y2="17" stroke="#181414" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="20" y1="23" x2="25" y2="25" stroke="#b8242e" stroke-width="1.6" stroke-linecap="round"/>
    </svg>
  `;
}

/**
 * Alice-in-Wonderland Horror Gothic Satchel UI overlay.
 * Allows selecting slots, viewing stack limits, using items, and physically dropping them.
 */
export class SatchelUI {
  /**
   * @param {HTMLElement} containerEl
   * @param {object} callbacks { onUse, onDrop, onClose }
   */
  constructor(containerEl, callbacks = {}) {
    this.callbacks = callbacks;

    this.el = document.createElement('div');
    this.el.id = 'inventory-overlay';
    this.el.className = 'fixed inset-0 hidden items-center justify-center bg-black/76 pointer-events-auto z-25';
    this.el.innerHTML = `
      <div class="wonderland-satchel w-[min(640px,94vw)] p-7 md:p-8 flex flex-col gap-5" role="dialog" aria-label="Curiosity Satchel">
        <div class="flex items-end justify-between border-b border-[#d9bc92]/20 pb-3">
          <div class="flex items-center gap-3">
            <svg width="26" height="34" viewBox="0 0 26 34" fill="none" aria-hidden="true">
              <circle cx="13" cy="11" r="7" stroke="#d9bc92" stroke-width="1.6"/>
              <path d="M10 17 L7 31 L19 31 L16 17" stroke="#d9bc92" stroke-width="1.6" fill="rgba(201,52,43,0.22)"/>
            </svg>
            <h2 class="horror-text text-5xl text-[#efe5d2] leading-none m-0">curiosity satchel</h2>
          </div>
          <span id="satchel-capacity" class="horror-text text-3xl text-[#d4a44a] leading-none">0 / 6 pockets</span>
        </div>

        <div id="satchel-grid" class="grid grid-cols-3 gap-3"></div>

        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-t border-[#d9bc92]/20 pt-4">
          <div class="flex-1 min-w-0">
            <div id="satchel-item-name" class="horror-text text-4xl text-[#f3ead8] leading-none">empty pocket</div>
            <p id="satchel-item-desc" class="horror-text text-2xl text-[#cfc3b0]/80 mt-1 mb-0 leading-snug">
              search beneath fallen arches and atop oak chests for curiosities.
            </p>
          </div>
          <div class="flex items-center gap-3 shrink-0">
            <button id="btn-item-use" type="button" class="horror-btn px-6 py-1.5 text-3xl text-[#f3ead8]">use</button>
            <button id="btn-item-drop" type="button" class="horror-btn px-6 py-1.5 text-3xl text-[#e2a59d]">drop</button>
            <button id="btn-satchel-close" type="button" class="horror-btn px-5 py-1.5 text-3xl text-[#c8bda9]">close</button>
          </div>
        </div>
      </div>
    `;
    containerEl.appendChild(this.el);

    this.capEl = this.el.querySelector('#satchel-capacity');
    this.gridEl = this.el.querySelector('#satchel-grid');
    this.nameEl = this.el.querySelector('#satchel-item-name');
    this.descEl = this.el.querySelector('#satchel-item-desc');
    this.useBtn = this.el.querySelector('#btn-item-use');
    this.dropBtn = this.el.querySelector('#btn-item-drop');
    this.closeBtn = this.el.querySelector('#btn-satchel-close');

    this.inventory = null;

    this.useBtn.addEventListener('click', () => {
      if (!this.inventory) return;
      this.callbacks.onUse?.(this.inventory.selectedSlot);
    });
    this.dropBtn.addEventListener('click', () => {
      if (!this.inventory) return;
      this.callbacks.onDrop?.(this.inventory.selectedSlot);
    });
    this.closeBtn.addEventListener('click', () => {
      this.callbacks.onClose?.();
    });
  }

  setVisible(visible, inventory) {
    this.el.classList.toggle('hidden', !visible);
    this.el.classList.toggle('flex', visible);
    if (visible && inventory) {
      this.render(inventory);
    }
  }

  render(inventory) {
    this.inventory = inventory;
    const used = countUsedSlots(inventory);
    this.capEl.textContent = `${used} / ${inventory.maxSlots} pockets`;

    this.gridEl.innerHTML = '';
    for (let i = 0; i < inventory.maxSlots; i++) {
      const slot = inventory.slots[i];
      const def = slot ? ITEM_CATALOG[slot.id] : null;
      const isSelected = inventory.selectedSlot === i;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'satchel-slot p-3 flex flex-col items-center justify-between min-h-[118px] cursor-pointer text-center';
      btn.dataset.selected = isSelected ? 'true' : 'false';
      btn.setAttribute('aria-label', def ? `Slot ${i + 1}: ${def.name} (${slot.qty}/${def.maxStack})` : `Slot ${i + 1}: empty`);

      if (def) {
        btn.innerHTML = `
          <div class="w-full flex items-center justify-between text-xl horror-text text-[#c8bda9]/70 leading-none">
            <span>${i + 1}</span>
            <span class="text-[#e6c17a]">${slot.qty}/${def.maxStack}</span>
          </div>
          <div class="my-1">${renderWonderlandIcon(def.id)}</div>
          <div class="horror-text text-2xl text-[#f1e7d5] leading-none truncate w-full">${def.name}</div>
        `;
      } else {
        btn.innerHTML = `
          <div class="w-full flex items-center justify-between text-xl horror-text text-[#c8bda9]/40 leading-none">
            <span>${i + 1}</span>
            <span>—</span>
          </div>
          <div class="horror-text text-2xl text-[#a89d8b]/35 my-auto">empty</div>
        `;
      }

      btn.addEventListener('click', () => {
        selectInventorySlot(inventory, i);
        this.render(inventory);
      });
      this.gridEl.appendChild(btn);
    }

    const activeSlot = inventory.slots[inventory.selectedSlot];
    const activeDef = activeSlot ? ITEM_CATALOG[activeSlot.id] : null;

    if (activeDef) {
      this.nameEl.textContent = `${activeDef.name} · ${activeSlot.qty} / ${activeDef.maxStack}`;
      this.descEl.textContent = activeDef.description;
      this.useBtn.disabled = false;
      this.dropBtn.disabled = false;
      this.useBtn.style.opacity = '1';
      this.dropBtn.style.opacity = '1';
    } else {
      this.nameEl.textContent = 'empty pocket';
      this.descEl.textContent = 'search beneath fallen arches and atop oak chests for curiosities.';
      this.useBtn.disabled = true;
      this.dropBtn.disabled = true;
      this.useBtn.style.opacity = '0.42';
      this.dropBtn.style.opacity = '0.42';
    }
  }
}
