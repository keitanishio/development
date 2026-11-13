import { computeTargets, sumMeals, saltG, ymd, mealTypeByHour } from "./calc.js";

const $ = (s) => document.querySelector(s);
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
};
const DEFAULT_PROFILE = { sex: "male", age: 30, height: 170, weight: 65, activity: 2, goal: "maintain" };

let profile = { ...DEFAULT_PROFILE, ...store.get("profile", {}) };
let meals = store.get("meals", {}); // { "YYYY-MM-DD": [meal] }
let day = new Date();
let editing = null; // { id|null, thumb, items }

// 画面要素を安全に生成(AI の出力を innerHTML に入れない)
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const k of kids.flat()) e.append(k instanceof Node ? k : document.createTextNode(k ?? ""));
  return e;
}
const toast = (msg) => {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3500);
};
const save = () => store.set("meals", meals);
const targets = () => computeTargets(profile);
const dayMeals = (d = ymd(day)) => meals[d] ?? [];
const round = (n) => Math.round(n);

/* ---------- 今日 ---------- */
function bar(label, val, goal, unit, color) {
  const pct = goal ? Math.min(100, (val / goal) * 100) : 0;
  const i = h("i", {}, h("span", { style: `width:${pct}%` }));
  return h("div", { class: "bar", style: `--col:${color}` },
    h("label", {}, h("span", {}, label), h("span", {}, `${round(val)} / ${goal}${unit}`)), i);
}

function renderToday() {
  const t = targets(), s = sumMeals(dayMeals());
  const today = ymd(day) === ymd();
  $("#dateLabel").textContent = `${day.getMonth() + 1}月${day.getDate()}日(${"日月火水木金土"[day.getDay()]})${today ? " 今日" : ""}`;
  $("#nextDay").style.visibility = today ? "hidden" : "visible";

  const pct = (s.calories / t.calories) * 100;
  const ring = $("#ring");
  ring.style.setProperty("--pct", Math.min(100, pct));
  ring.style.setProperty("--col", pct > 110 ? "var(--red)" : "var(--g)");
  $("#kcalNow").textContent = round(s.calories);
  $("#kcalGoal").textContent = `/ ${t.calories} kcal`;
  $("#macros").replaceChildren(
    bar("たんぱく質", s.protein, t.protein, "g", "var(--p)"),
    bar("脂質", s.fat, t.fat, "g", "var(--f)"),
    bar("炭水化物", s.carbs, t.carbs, "g", "var(--c)"),
    bar("食物繊維", s.fiber, t.fiber, "g", "#8b5cf6"),
  );

  const w = $("#warnings"), msgs = [];
  if (s.calories > t.calories * 1.1) msgs.push(`カロリーが目標を ${round(s.calories - t.calories)} kcal 超過しています`);
  if (s.sodium > t.sodium) msgs.push(`食塩相当量 ${saltG(s.sodium)}g(目安 ${saltG(t.sodium)}g 未満)`);
  w.hidden = !msgs.length;
  w.replaceChildren(...msgs.map((m) => h("div", { class: "warn" }, "⚠ " + m)));

  const list = $("#mealList");
  const ms = dayMeals().slice().sort((a, b) => a.time.localeCompare(b.time));
  list.replaceChildren(...(ms.length ? ms.map(mealRow) : [h("p", { class: "muted" }, "まだ記録がありません。写真を撮って記録しましょう。")]));
}

function mealRow(m) {
  return h("div", { class: "meal", onclick: () => openDialog(m) },
    m.thumb ? h("img", { src: m.thumb, alt: "" }) : h("div", { class: "ph" }, "🍽"),
    h("div", { class: "t" }, h("b", {}, m.name),
      h("small", {}, h("span", { class: "tag" }, m.type), `${m.time}  P${round(m.protein)} F${round(m.fat)} C${round(m.carbs)}`)),
    h("div", { class: "k" }, `${round(m.calories)} kcal`));
}

/* ---------- 画像処理・解析 ---------- */
function loadImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => rej(new Error("画像を読み込めませんでした"));
    img.src = url;
  });
}
function resize(img, max, q) {
  const r = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", q);
}
async function api(path, body) {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `通信エラー (${r.status})`);
  return j;
}

$("#photo").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  $("#loading").hidden = false;
  try {
    const img = await loadImage(file);
    const full = resize(img, 1280, 0.85), thumb = resize(img, 160, 0.7);
    const r = await api("/api/analyze", { image: full.split(",")[1], mediaType: "image/jpeg" });
    if (!r.is_food) return toast("食事の写真として認識できませんでした");
    openDialog(null, { ...r, thumb, preview: full });
  } catch (err) {
    toast(err.message);
  } finally {
    $("#loading").hidden = true;
  }
});
$("#manualAdd").addEventListener("click", () => openDialog(null, { name: "", calories: "", items: [] }));

/* ---------- 編集ダイアログ ---------- */
const dlg = $("#dlg"), form = $("#mealForm");
const FIELDS = ["name", "type", "calories", "protein", "fat", "carbs", "fiber", "sugar", "sodium"];

function openDialog(existing, draft) {
  const m = existing ?? draft;
  editing = { id: existing?.id ?? null, thumb: m.thumb ?? null, items: m.items ?? [], time: existing?.time };
  $("#dlgTitle").textContent = existing ? "食事を編集" : "食事を確認";
  $("#preview").hidden = !m.preview; if (m.preview) $("#preview").src = m.preview;
  $("#aiComment").textContent = draft?.comment ? `AI推定(信頼度: ${{ high: "高", medium: "中", low: "低" }[draft.confidence] ?? "-"}): ${draft.comment}` : "";
  for (const f of FIELDS) form.elements[f].value = m[f] ?? (f === "type" ? mealTypeByHour(new Date().getHours()) : "");
  $("#items").replaceChildren(...(m.items ?? []).map((i) => h("li", {}, `${i.name}${i.amount ? `(${i.amount})` : ""} ${i.calories ? i.calories + " kcal" : ""}`)));
  $("#delMeal").hidden = !existing;
  dlg.showModal();
}

dlg.addEventListener("close", () => {
  if (dlg.returnValue !== "ok") return;
  const v = Object.fromEntries(FIELDS.map((f) => [f, form.elements[f].value]));
  const n = (x) => Number(x) || 0;
  const now = new Date();
  const meal = {
    id: editing.id ?? crypto.randomUUID(), name: v.name.trim() || "食事", type: v.type,
    time: editing.time ?? `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    calories: n(v.calories), protein: n(v.protein), fat: n(v.fat), carbs: n(v.carbs),
    fiber: n(v.fiber), sugar: n(v.sugar), sodium: n(v.sodium), thumb: editing.thumb, items: editing.items,
  };
  const key = ymd(day), list = dayMeals(key).filter((x) => x.id !== meal.id);
  meals[key] = [...list, meal];
  save(); renderToday();
});
$("#delMeal").addEventListener("click", () => {
  if (!confirm("この記録を削除しますか?")) return;
  meals[ymd(day)] = dayMeals().filter((x) => x.id !== editing.id);
  save(); dlg.close("delete"); renderToday();
});

/* ---------- アドバイス ---------- */
$("#advice").addEventListener("click", async () => {
  const ms = dayMeals();
  if (!ms.length) return toast("先に食事を記録してください");
  const btn = $("#advice"); btn.disabled = true; btn.textContent = "分析中…";
  try {
    const history = lastDays(7).filter((d) => d.date !== ymd(day)).map((d) => ({ 日付: d.date, kcal: round(d.total.calories) }));
    const t = targets(), s = sumMeals(ms);
    const r = await api("/api/advice", {
      profile: { 性別: profile.sex === "male" ? "男性" : "女性", 年齢: profile.age, 身長cm: profile.height, 体重kg: profile.weight, 目的: { lose: "減量", maintain: "維持", gain: "増量" }[profile.goal] },
      targets: t, totals: Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Math.round(v * 10) / 10])), meals: ms, history,
    });
    renderAdvice(r);
  } catch (err) { toast(err.message); }
  finally { btn.disabled = false; btn.textContent = "今日の食事を評価"; }
});
function renderAdvice(r) {
  const list = (title, arr) => arr?.length ? [h("h4", {}, title), h("ul", {}, arr.map((x) => h("li", {}, x)))] : [];
  const box = $("#adviceBox"); box.className = "adv";
  box.replaceChildren(
    h("div", { class: "row" }, h("span", { class: "score" }, `${r.score}`), h("span", { class: "muted" }, "/ 100"), h("span", {}, r.summary)),
    ...list("👍 良い点", r.good), ...list("🔧 改善点", r.improve),
    ...(r.next_meal ? [h("h4", {}, "🍽 次の食事の提案"), h("p", {}, r.next_meal)] : []),
    ...list("💡 ヒント", r.tips),
    h("p", { class: "muted" }, "※ 目安であり医療的助言ではありません。"),
  );
}

/* ---------- 履歴 ---------- */
function lastDays(n) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - i);
    const date = ymd(d);
    return { date, label: `${d.getMonth() + 1}/${d.getDate()}`, total: sumMeals(dayMeals(date)), count: dayMeals(date).length };
  }).reverse();
}
function renderHistory() {
  const days = lastDays(7), goal = targets().calories;
  const c = $("#chart"), dpr = devicePixelRatio || 1, W = c.clientWidth, H = 180;
  c.width = W * dpr; c.height = H * dpr;
  const g = c.getContext("2d"); g.scale(dpr, dpr);
  const css = getComputedStyle(document.body);
  const max = Math.max(goal * 1.3, ...days.map((d) => d.total.calories));
  const bw = W / days.length, y = (v) => H - 24 - (v / max) * (H - 40);
  g.font = "11px system-ui"; g.textAlign = "center";
  days.forEach((d, i) => {
    const x = i * bw + bw * 0.2, w = bw * 0.6, top = y(d.total.calories);
    g.fillStyle = d.total.calories > goal * 1.1 ? "#dc2626" : "#16a34a";
    g.fillRect(x, top, w, H - 24 - top);
    g.fillStyle = css.color; g.fillText(d.label, x + w / 2, H - 8);
    if (d.count) g.fillText(round(d.total.calories), x + w / 2, top - 4);
  });
  g.strokeStyle = "#f59e0b"; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(0, y(goal)); g.lineTo(W, y(goal)); g.stroke();
  $("#histList").replaceChildren(...days.slice().reverse().map((d) =>
    h("div", { class: "histrow", onclick: () => { day = new Date(d.date + "T00:00:00"); showView("today"); } },
      h("span", {}, `${d.label}  (${d.count}件)`),
      h("span", {}, `${round(d.total.calories)} kcal / P${round(d.total.protein)} F${round(d.total.fat)} C${round(d.total.carbs)}`))));
}

/* ---------- 設定 ---------- */
function renderSettings() {
  for (const [k, v] of Object.entries(profile)) $("#profileForm").elements[k].value = v;
  const t = targets();
  $("#targetBox").replaceChildren(h("h3", {}, "1日の目標(自動算出)"),
    h("p", {}, `${t.calories} kcal ・ たんぱく質 ${t.protein}g ・ 脂質 ${t.fat}g ・ 炭水化物 ${t.carbs}g`),
    h("p", { class: "muted" }, `食物繊維 ${t.fiber}g以上 ・ 食塩相当量 ${saltG(t.sodium)}g未満(基礎代謝: Mifflin-St Jeor式 × 活動係数)`));
}
$("#profileForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target.elements;
  profile = { sex: f.sex.value, age: +f.age.value, height: +f.height.value, weight: +f.weight.value, activity: +f.activity.value, goal: f.goal.value };
  store.set("profile", profile); renderSettings(); toast("保存しました");
});
$("#exportBtn").addEventListener("click", () => {
  const a = h("a", { href: URL.createObjectURL(new Blob([JSON.stringify({ profile, meals }, null, 2)], { type: "application/json" })), download: `meals-${ymd()}.json` });
  a.click();
});
$("#clearBtn").addEventListener("click", () => {
  if (!confirm("すべての記録とプロフィールを削除します。よろしいですか?")) return;
  localStorage.clear(); meals = {}; profile = { ...DEFAULT_PROFILE }; renderSettings(); renderToday();
});

/* ---------- ナビゲーション ---------- */
function showView(name) {
  document.querySelectorAll(".view").forEach((v) => (v.hidden = v.id !== `view-${name}`));
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  if (name === "today") renderToday(); else if (name === "history") renderHistory(); else renderSettings();
}
document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));
$("#prevDay").addEventListener("click", () => { day.setDate(day.getDate() - 1); renderToday(); });
$("#nextDay").addEventListener("click", () => { day.setDate(day.getDate() + 1); renderToday(); });

fetch("/api/status").then((r) => r.json()).then((s) => {
  $("#modeBadge").textContent = s.demo ? "デモモード(APIキー未設定)" : "AI解析 有効";
}).catch(() => {});
showView("today");
