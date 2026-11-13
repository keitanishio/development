import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "public");

// .env の簡易ローダ(依存パッケージなし)
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

const PORT = Number(process.env.PORT) || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY || "";
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const MAX_BODY = 12 * 1024 * 1024;
const ALLOWED_MEDIA = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

async function callClaude(content, { system, maxTokens = 1500 } = {}) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new HttpError(502, `Claude API エラー (${res.status}): ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}

export function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new HttpError(502, "AI の応答を解釈できませんでした");
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new HttpError(502, "AI の応答 JSON が不正です");
  }
}

const num = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v) * 10) / 10) : 0);

export function normalizeMeal(raw) {
  const items = Array.isArray(raw.items) ? raw.items : [];
  const out = {
    is_food: raw.is_food !== false,
    name: String(raw.name || "食事").slice(0, 80),
    items: items.slice(0, 20).map((i) => ({
      name: String(i.name || "").slice(0, 60),
      amount: String(i.amount || "").slice(0, 40),
      calories: num(i.calories),
    })),
    calories: num(raw.calories),
    protein: num(raw.protein),
    fat: num(raw.fat),
    carbs: num(raw.carbs),
    fiber: num(raw.fiber),
    sugar: num(raw.sugar),
    sodium: num(raw.sodium),
    confidence: ["high", "medium", "low"].includes(raw.confidence) ? raw.confidence : "medium",
    comment: String(raw.comment || "").slice(0, 300),
  };
  return out;
}

const ANALYZE_SYSTEM = `あなたは管理栄養士です。食事の写真から料理と量を推定し、栄養素を概算します。
日本の食事(日本食品標準成分表の一般的な値)を基準にしてください。
出力は次の JSON オブジェクトのみ(前後に文章やコードフェンスを付けない)。
{
 "is_food": boolean,            // 食事の写真でなければ false
 "name": string,                // 料理全体の名称(例: "鮭定食")
 "items": [{"name": string, "amount": string, "calories": number}],
 "calories": number,            // kcal 合計
 "protein": number, "fat": number, "carbs": number,   // g
 "fiber": number, "sugar": number,                    // g
 "sodium": number,                                    // mg
 "confidence": "high"|"medium"|"low",
 "comment": string              // 推定の根拠や注意点を1〜2文で
}
items の calories 合計は calories と概ね一致させること。数値は 1 食分の合計です。`;

const ADVICE_SYSTEM = `あなたは親身で専門的な管理栄養士です。ユーザーの1日の食事記録と目標から、日本語で簡潔かつ具体的な助言をします。
医療的な診断や治療の指示はせず、疾患・妊娠中・摂食障害の懸念がある場合は専門家への相談を促してください。
出力は次の JSON オブジェクトのみ(コードフェンス不要)。
{
 "score": number,               // 0-100 の総合スコア
 "summary": string,             // 全体講評 2文以内
 "good": [string],              // 良い点 最大3
 "improve": [string],           // 改善点 最大3(数値の根拠付き)
 "next_meal": string,           // 次の食事の具体的な提案(料理例)
 "tips": [string]               // 明日以降のヒント 最大3
}`;

function demoMeal() {
  return {
    is_food: true,
    name: "デモ: 鮭の塩焼き定食",
    items: [
      { name: "ご飯", amount: "茶碗1杯(150g)", calories: 252 },
      { name: "鮭の塩焼き", amount: "1切れ(80g)", calories: 150 },
      { name: "味噌汁", amount: "1杯", calories: 40 },
      { name: "ほうれん草のお浸し", amount: "小鉢1", calories: 30 },
    ],
    calories: 472, protein: 28, fat: 10, carbs: 66, fiber: 4, sugar: 3, sodium: 1700,
    confidence: "low",
    comment: "ANTHROPIC_API_KEY が未設定のためデモ値を返しています。",
  };
}

function demoAdvice(totals, targets) {
  const diff = Math.round(totals.calories - targets.calories);
  return {
    score: 70,
    summary: `デモ応答です。目標との差は ${diff >= 0 ? "+" : ""}${diff} kcal です。`,
    good: ["記録を継続できています"],
    improve: ["ANTHROPIC_API_KEY を設定すると個別アドバイスが生成されます"],
    next_meal: "主食・主菜・副菜をそろえた定食スタイルがおすすめです。",
    tips: ["水分をこまめに摂りましょう"],
  };
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function handleAnalyze(body) {
  const { image, mediaType, note } = body;
  if (typeof image !== "string" || !image) throw new HttpError(400, "image が必要です");
  if (!ALLOWED_MEDIA.has(mediaType)) throw new HttpError(400, "未対応の画像形式です");
  if (!API_KEY) return { ...demoMeal(), demo: true };
  const text = await callClaude(
    [
      { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
      { type: "text", text: `この食事を解析してください。${note ? `\n補足情報: ${String(note).slice(0, 200)}` : ""}` },
    ],
    { system: ANALYZE_SYSTEM },
  );
  return normalizeMeal(extractJson(text));
}

async function handleAdvice(body) {
  const { profile = {}, targets = {}, totals = {}, meals = [], history = [] } = body;
  if (!API_KEY) return { ...demoAdvice(totals, targets), demo: true };
  const payload = {
    プロフィール: profile,
    "1日の目標": targets,
    "今日の摂取合計": totals,
    今日の食事: meals.slice(0, 20).map((m) => ({
      区分: m.type, 時刻: m.time, 料理: m.name,
      kcal: m.calories, P: m.protein, F: m.fat, C: m.carbs, 食物繊維: m.fiber, ナトリウムmg: m.sodium,
    })),
    直近の日別kcal: history.slice(0, 7),
  };
  const text = await callClaude(
    [{ type: "text", text: `次の記録に基づいてアドバイスしてください。\n${JSON.stringify(payload)}` }],
    { system: ADVICE_SYSTEM, maxTokens: 1200 },
  );
  const r = extractJson(text);
  const arr = (v) => (Array.isArray(v) ? v.slice(0, 3).map((s) => String(s).slice(0, 200)) : []);
  return {
    score: Math.min(100, Math.max(0, Math.round(Number(r.score) || 0))),
    summary: String(r.summary || "").slice(0, 400),
    good: arr(r.good), improve: arr(r.improve), tips: arr(r.tips),
    next_meal: String(r.next_meal || "").slice(0, 300),
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, "リクエストが大きすぎます"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new HttpError(400, "JSON が不正です"));
      }
    });
    req.on("error", reject);
  });
}

function send(res, status, obj) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(obj));
}

function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/") rel = "/index.html";
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    return res.end("Not Found");
  }
  res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

export const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/api/status") {
      return send(res, 200, { demo: !API_KEY, model: MODEL });
    }
    if (req.method === "POST" && req.url === "/api/analyze") return send(res, 200, await handleAnalyze(await readBody(req)));
    if (req.method === "POST" && req.url === "/api/advice") return send(res, 200, await handleAdvice(await readBody(req)));
    if (req.method === "GET") return serveStatic(req, res);
    send(res, 405, { error: "Method Not Allowed" });
  } catch (e) {
    send(res, e.status || 500, { error: e.status ? e.message : "サーバーエラー" });
    if (!e.status) console.error(e);
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => {
    console.log(`Meal Manager: http://localhost:${PORT} (${API_KEY ? `model=${MODEL}` : "デモモード: ANTHROPIC_API_KEY 未設定"})`);
  });
}
