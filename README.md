# 食事管理アプリ (Meal Manager)

食事の写真から料理・量・栄養素を AI(Claude)が推定し、1日の摂取量管理とアドバイスを提供する Web アプリです。

## 機能
- 📷 写真から カロリー / たんぱく質 / 脂質 / 炭水化物 / 食物繊維 / 糖質 / ナトリウム(食塩相当量)を推定。結果は編集して保存可能
- 📊 1日の目標(Mifflin-St Jeor 式 + 活動量 + 目的)に対する進捗リング・PFC バー・超過警告
- 🧠 AI 管理栄養士による講評(スコア、良い点、改善点、次の食事提案、ヒント)
- 📈 直近7日間のカロリー推移
- 💾 記録はブラウザの localStorage に保存(サーバーに DB なし)。JSON 書き出し対応

## 起動
```bash
cp .env.example .env   # ANTHROPIC_API_KEY を設定
npm start              # http://localhost:3000
npm test
```
`ANTHROPIC_API_KEY` 未設定時は固定サンプルを返すデモモードで動作します。スマホで撮影する場合は HTTPS 経由で公開してください(`capture` によるカメラ起動のため)。

## 構成
| ファイル | 役割 |
|---|---|
| `server.js` | 静的配信 + `/api/analyze`(画像解析)・`/api/advice`(助言)。API キーはサーバー側のみ保持 |
| `public/calc.js` | 目標算出・集計ロジック |
| `public/app.js` | UI / ローカル保存 |

## 注意
栄養値は画像からの推定値で、誤差があります。医療的助言ではありません。
