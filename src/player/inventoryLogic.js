/**
 * Pure Alice-in-Wonderland Gothic Inventory System logic.
 * Free of DOM/Three.js dependencies for fast deterministic unit testing.
 */

export const MAX_INVENTORY_SLOTS = 6;

export const ITEM_CATALOG = {
  drink_me: {
    id: 'drink_me',
    name: '"drink me" vial',
    tag: 'curative',
    description: 'crimson tincture in a corked phial. mends +40 vitality.',
    maxStack: 3,
    kind: 'health',
    healAmount: 40,
  },
  brass_ammo: {
    id: 'brass_ammo',
    name: 'brass 9mm tin',
    tag: 'cartridges',
    description: 'tarnished tea-tin of 9mm rounds. adds +15 to reserve.',
    maxStack: 4,
    kind: 'ammo',
    ammoAmount: 15,
  },
  eat_me: {
    id: 'eat_me',
    name: '"eat me" wafer',
    tag: 'looking-glass',
    description: 'dusted spiced biscuit. shrinks your stature for 8s and heals +15.',
    maxStack: 2,
    kind: 'shrink',
    healAmount: 15,
    shrinkDuration: 8.0,
  },
  pocket_watch: {
    id: 'pocket_watch',
    name: 'white rabbit watch',
    tag: 'chronometer',
    description: 'cracked brass timepiece. slows husks and wraiths for 6s.',
    maxStack: 2,
    kind: 'slow',
    slowDuration: 6.0,
  },
  level_disc: {
    id: 'level_disc',
    name: 'archive disc',
    tag: 'level disc',
    description: 'the floor\'s vinyl. rises from the floor only when every enemy on the floor has fallen.',
    maxStack: 1,
    kind: 'disc',
  },
  darko_drink: {
    id: 'darko_drink',
    name: '*DARKO* energy drink',
    tag: 'beverage',
    description: 'sleek chilled can with bold darko lettering. rolls out of the shattered barrel.',
    maxStack: 2,
    kind: 'pickup',
  },
  maze_key: {
    id: 'maze_key',
    name: 'iron maze key',
    tag: 'key',
    description: 'heavy blackened iron key that unseals the maze-end door.',
    maxStack: 1,
    kind: 'key',
  },
  golden_vinyl: {
    id: 'golden_vinyl',
    name: 'golden vinyl',
    tag: 'relic',
    description: 'gleaming golden vinyl from the lion shrine. returning it unseals track 1.',
    maxStack: 1,
    kind: 'disc',
  },
  first_disc: {
    id: 'first_disc',
    name: 'faces vinyl disc',
    tag: 'disc',
    description: 'marked with the radiant triad tribal symbol.',
    maxStack: 1,
    kind: 'disc',
  },
  red_shells: {
    id: 'red_shells',
    name: 'red shell box',
    tag: 'ammo',
    description: 'crimson cardboard box of 12-gauge shotgun shells.',
    maxStack: 4,
    kind: 'ammo',
  },
};

/**
 * Creates a fresh empty satchel with fixed slot capacity.
 * @param {number} [maxSlots]
 */
export function createInventory(maxSlots = MAX_INVENTORY_SLOTS) {
  return {
    maxSlots,
    selectedSlot: 0,
    slots: Array.from({ length: maxSlots }, () => null),
  };
}

/**
 * Counts how many satchel slots are currently occupied.
 */
export function countUsedSlots(inv) {
  let count = 0;
  for (let i = 0; i < inv.slots.length; i++) {
    if (inv.slots[i] && inv.slots[i].qty > 0) count++;
  }
  return count;
}

/**
 * Total count of a specific item across all slots.
 */
export function countItemQuantity(inv, itemId) {
  let total = 0;
  for (let i = 0; i < inv.slots.length; i++) {
    const s = inv.slots[i];
    if (s && s.id === itemId) total += s.qty;
  }
  return total;
}

/**
 * Adds an item into the satchel respecting per-item maxStack and total slot limits.
 * Stacks into existing matching slots first, then opens an empty slot if available.
 * @param {object} inv
 * @param {string} itemId
 * @param {number} [qty]
 */
export function addItemToInventory(inv, itemId, qty = 1) {
  const def = ITEM_CATALOG[itemId];
  if (!def || qty <= 0) {
    return { added: 0, remaining: qty, reason: 'invalid' };
  }

  let remaining = qty;
  let added = 0;
  let targetSlot = -1;

  // 1. Fill existing matching stacks that have headroom
  for (let i = 0; i < inv.slots.length && remaining > 0; i++) {
    const slot = inv.slots[i];
    if (slot && slot.id === itemId && slot.qty < def.maxStack) {
      const space = def.maxStack - slot.qty;
      const take = Math.min(space, remaining);
      slot.qty += take;
      added += take;
      remaining -= take;
      if (targetSlot === -1) targetSlot = i;
    }
  }

  // 2. Place remaining into empty slots (capped by maxStack per slot)
  for (let i = 0; i < inv.slots.length && remaining > 0; i++) {
    if (!inv.slots[i]) {
      const take = Math.min(def.maxStack, remaining);
      inv.slots[i] = { id: itemId, qty: take };
      added += take;
      remaining -= take;
      if (targetSlot === -1) targetSlot = i;
    }
  }

  // Auto-focus first non-empty slot if currently selected slot is empty
  if (added > 0 && !inv.slots[inv.selectedSlot] && targetSlot !== -1) {
    inv.selectedSlot = targetSlot;
  }

  return {
    added,
    remaining,
    slotIndex: targetSlot,
    reason: remaining > 0 ? 'full' : 'ok',
  };
}

/**
 * Selects a slot index safely clamped to [0, maxSlots - 1].
 */
export function selectInventorySlot(inv, index) {
  if (index < 0 || index >= inv.maxSlots) return inv.selectedSlot;
  inv.selectedSlot = index;
  return inv.selectedSlot;
}

/**
 * Uses 1 unit of the item in `slotIndex`, enforcing sensible usage rules
 * (e.g., refuses wasting a pure health vial at full HP).
 * @param {object} inv
 * @param {number} slotIndex
 * @param {{ hp: number, maxHp: number, reserveAmmo: number, maxReserveAmmo: number }} playerState
 */
export function useInventoryItem(inv, slotIndex, playerState) {
  const slot = inv.slots[slotIndex];
  if (!slot || slot.qty <= 0) {
    return { used: false, reason: 'empty', effects: null };
  }
  const def = ITEM_CATALOG[slot.id];
  if (!def) {
    return { used: false, reason: 'unknown', effects: null };
  }

  if (def.kind === 'health' && playerState.hp >= playerState.maxHp) {
    return { used: false, reason: 'hp_full', effects: null };
  }
  if (def.kind === 'ammo' && playerState.reserveAmmo >= playerState.maxReserveAmmo) {
    return { used: false, reason: 'ammo_full', effects: null };
  }

  slot.qty -= 1;
  if (slot.qty <= 0) {
    inv.slots[slotIndex] = null;
  }

  return {
    used: true,
    reason: 'ok',
    item: def,
    effects: {
      heal: def.healAmount || 0,
      ammo: def.ammoAmount || 0,
      shrinkDuration: def.shrinkDuration || 0,
      slowDuration: def.slowDuration || 0,
    },
  };
}

/**
 * Drops 1 unit of the item in `slotIndex` so the caller can spawn it on the floor.
 */
export function dropInventoryItem(inv, slotIndex) {
  const slot = inv.slots[slotIndex];
  if (!slot || slot.qty <= 0) {
    return { dropped: false, itemId: null };
  }
  const itemId = slot.id;
  slot.qty -= 1;
  if (slot.qty <= 0) {
    inv.slots[slotIndex] = null;
  }
  return {
    dropped: true,
    itemId,
    item: ITEM_CATALOG[itemId],
  };
}
