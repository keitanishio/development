import test from "node:test";
import assert from "node:assert/strict";
import { computeTargets, sumMeals, saltG } from "./public/calc.js";
import { normalizeMeal, extractJson } from "./server.js";

test("目標カロリー: 維持は TDEE 相当、減量は約-500", () => {
  const p = { sex: "male", age: 30, height: 170, weight: 65, activity: 2 };
  const m = computeTargets({ ...p, goal: "maintain" }), l = computeTargets({ ...p, goal: "lose" });
  assert.ok(m.calories > 2000 && m.calories < 2300, String(m.calories));
  assert.equal(m.calories - l.calories, 500);
  assert.ok(Math.abs(m.protein * 4 + m.fat * 9 + m.carbs * 4 - m.calories) < 20);
});
test("集計と食塩換算", () => {
  const t = sumMeals([{ calories: 100, sodium: 1000 }, { calories: "50", protein: 3 }]);
  assert.equal(t.calories, 150); assert.equal(t.protein, 3);
  assert.equal(saltG(2300), 5.8);
});
test("AI応答の正規化(コードフェンス・不正値)", () => {
  const r = extractJson('```json\n{"name":"X","calories":"abc","protein":-5,"confidence":"?"}\n```');
  const n = normalizeMeal(r);
  assert.equal(n.calories, 0); assert.equal(n.protein, 0); assert.equal(n.confidence, "medium");
});
