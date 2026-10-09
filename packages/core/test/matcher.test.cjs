const { test } = require('node:test');
const assert = require('node:assert/strict');
const { matchItemsForIntake, buildShoppingListItems } = require('../dist');

const food = (overrides = {}) => ({ id: 1, name: 'Canned Beans', category: 'protein', quantity: 10, unit: 'can', isInStock: true, vegan: true, vegetarian: true, glutenFree: true, halal: true, kosher: true, requiresStove: false, requiresFridge: false, ...overrides });
const intake = (overrides = {}) => ({ dietaryAvoid: [], householdSize: 4, hasStove: null, hasFridge: null, ...overrides });

test('unavailable inventory is never matched', () => {
  assert.deepEqual(matchItemsForIntake([food({ quantity: 0 }), food({ isInStock: false })], intake()), []);
});
test('all original allergy-name rules are preserved', () => {
  for (const [avoid, name] of [['peanut', 'Peanut Butter'], ['dairy', 'Whole Milk'], ['pork', 'Pork'], ['shellfish', 'Shrimp'], ['soy', 'Soy Sauce'], ['egg', 'Eggs'], ['nuts', 'Almond Butter']]) {
    assert.deepEqual(matchItemsForIntake([food({ name })], intake({ dietaryAvoid: [avoid.toUpperCase()] })), [], avoid);
  }
});
test('gluten, vegan, vegetarian, halal, and kosher flags are required when requested', () => {
  for (const [avoid, flag] of [['gluten', 'glutenFree'], ['vegan', 'vegan'], ['vegetarian', 'vegetarian'], ['halal', 'halal'], ['kosher', 'kosher']]) {
    assert.deepEqual(matchItemsForIntake([food({ [flag]: false })], intake({ dietaryAvoid: [avoid] })), [], avoid);
    assert.equal(matchItemsForIntake([food()], intake({ dietaryAvoid: [avoid] })).length, 1);
  }
});
test('equipment exclusions apply, while unknown equipment keeps legacy defaults', () => {
  const items = [food({ requiresStove: true }), food({ id: 2, requiresFridge: true }), food({ id: 3 })];
  assert.deepEqual(matchItemsForIntake(items, intake({ hasStove: false, hasFridge: false })).map((item) => item.id), [3]);
  assert.equal(matchItemsForIntake(items, intake()).length, 3);
});
test('default cap is 20, with configurable review cap and stable order', () => {
  const items = Array.from({ length: 25 }, (_, index) => food({ id: index + 1 }));
  assert.equal(matchItemsForIntake(items, intake()).length, 20);
  assert.deepEqual(matchItemsForIntake(items, intake(), { maxItems: 2 }).map((item) => item.id), [1, 2]);
});
test('household quantity scales by two people and never exceeds stock', () => {
  const result = buildShoppingListItems([food(), food({ id: 2, quantity: 1 })], 5, ['peanuts']);
  assert.equal(result[0].quantity, 3);
  assert.equal(result[1].quantity, 1);
  assert.equal(result[0].notes, 'Avoids: peanuts');
  assert.equal(buildShoppingListItems([food()], null, [])[0].quantity, 1);
});
