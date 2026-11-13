// 栄養目標の算出・集計ロジック(ブラウザ/Node 共用)
const ACTIVITY = { 1: 1.2, 2: 1.375, 3: 1.55, 4: 1.725 };
const GOAL_DELTA = { lose: -500, maintain: 0, gain: 300 };

/** Mifflin-St Jeor 式による基礎代謝(kcal/日) */
export function bmr({ sex, age, height, weight }) {
  return 10 * weight + 6.25 * height - 5 * age + (sex === "male" ? 5 : -161);
}

/** プロフィールから 1 日の目標を算出 */
export function computeTargets(p) {
  const tdee = bmr(p) * (ACTIVITY[p.activity] ?? 1.375);
  const calories = Math.max(1200, Math.round((tdee + (GOAL_DELTA[p.goal] ?? 0)) / 10) * 10);
  const protein = Math.round(p.weight * (p.goal === "gain" ? 1.8 : 1.4));
  const fat = Math.round((calories * 0.25) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  return { calories, protein, fat, carbs, fiber: p.sex === "male" ? 21 : 18, sodium: 2300 }; // sodium(mg): 食塩約 5.8g 相当の目安
}

export const sumMeals = (meals) =>
  meals.reduce(
    (t, m) => {
      for (const k of ["calories", "protein", "fat", "carbs", "fiber", "sugar", "sodium"]) t[k] += Number(m[k]) || 0;
      return t;
    },
    { calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0, sugar: 0, sodium: 0 },
  );

/** ナトリウム(mg) → 食塩相当量(g) */
export const saltG = (sodiumMg) => Math.round(((sodiumMg * 2.54) / 1000) * 10) / 10;

/** 日付(ローカル) YYYY-MM-DD */
export function ymd(d = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export function mealTypeByHour(h) {
  if (h < 10) return "朝食";
  if (h < 15) return "昼食";
  if (h < 21) return "夕食";
  return "間食";
}
