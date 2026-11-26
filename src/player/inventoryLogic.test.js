import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_INVENTORY_SLOTS,
  ITEM_CATALOG,
  createInventory,
  addItemToInventory,
  useInventoryItem,
  dropInventoryItem,
  countUsedSlots,
  countItemQuantity,
  selectInventorySlot,
} from './inventoryLogic.js';

test('inventory stacks items up to maxStack and respects slot limits', () => {
  const inv = createInventory(2);
  assert.equal(inv.maxSlots, 2);

  // Drink Me maxStack is 3
  const r1 = addItemToInventory(inv, 'drink_me', 2);
  assert.equal(r1.added, 2);
  assert.equal(r1.remaining, 0);
  assert.equal(countUsedSlots(inv), 1);

  // Adding 2 more fills slot 0 to 3 and spills 1 into slot 1
  const r2 = addItemToInventory(inv, 'drink_me', 2);
  assert.equal(r2.added, 2);
  assert.equal(countUsedSlots(inv), 2);
  assert.equal(inv.slots[0].qty, 3);
  assert.equal(inv.slots[1].qty, 1);

  // Adding a different item when all 2 slots are occupied is blocked
  const r3 = addItemToInventory(inv, 'brass_ammo', 1);
  assert.equal(r3.added, 0);
  assert.equal(r3.remaining, 1);
  assert.equal(r3.reason, 'full');
});

test('using Drink Me vial heals when injured and refuses at full HP', () => {
  const inv = createInventory(MAX_INVENTORY_SLOTS);
  addItemToInventory(inv, 'drink_me', 2);

  const blocked = useInventoryItem(inv, 0, {
    hp: 100,
    maxHp: 100,
    reserveAmmo: 30,
    maxReserveAmmo: 180,
  });
  assert.equal(blocked.used, false);
  assert.equal(blocked.reason, 'hp_full');
  assert.equal(countItemQuantity(inv, 'drink_me'), 2);

  const healed = useInventoryItem(inv, 0, {
    hp: 65,
    maxHp: 100,
    reserveAmmo: 30,
    maxReserveAmmo: 180,
  });
  assert.equal(healed.used, true);
  assert.equal(healed.effects.heal, ITEM_CATALOG.drink_me.healAmount);
  assert.equal(countItemQuantity(inv, 'drink_me'), 1);
});

test('using the Brass 9mm tin returns ammo; the wafer and the watch are gone', () => {
  const inv = createInventory();
  addItemToInventory(inv, 'brass_ammo', 1);

  const ammoUse = useInventoryItem(inv, 0, {
    hp: 100,
    maxHp: 100,
    reserveAmmo: 45,
    maxReserveAmmo: 180,
  });
  assert.equal(ammoUse.used, true);
  assert.equal(ammoUse.effects.ammo, 15);
  assert.equal(inv.slots[0], null);

  // Playtest fix round (Nov 25, 2026): "eat me" wafer and the White
  // Rabbit pocket watch were removed from the game entirely.
  assert.equal(ITEM_CATALOG.eat_me, undefined);
  assert.equal(ITEM_CATALOG.pocket_watch, undefined);
  assert.equal(addItemToInventory(inv, 'eat_me', 1).added, 0);
  assert.equal(addItemToInventory(inv, 'pocket_watch', 1).added, 0);
});

test('the health pickup is the DARKO can (id drink_me, heal unchanged)', () => {
  assert.match(ITEM_CATALOG.drink_me.name, /DARKO/);
  assert.equal(ITEM_CATALOG.drink_me.healAmount, 40);
  assert.equal(ITEM_CATALOG.drink_me.kind, 'health');
});

test('dropping items decrements stack and clears slot when empty', () => {
  const inv = createInventory();
  addItemToInventory(inv, 'brass_ammo', 2);
  selectInventorySlot(inv, 0);

  const d1 = dropInventoryItem(inv, 0);
  assert.equal(d1.dropped, true);
  assert.equal(d1.itemId, 'brass_ammo');
  assert.equal(inv.slots[0].qty, 1);

  const d2 = dropInventoryItem(inv, 0);
  assert.equal(d2.dropped, true);
  assert.equal(inv.slots[0], null);

  const d3 = dropInventoryItem(inv, 0);
  assert.equal(d3.dropped, false);
});
