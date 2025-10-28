# 埼玉県クーリングスポット検索サイト

このリポジトリは、埼玉県が公開する「指定暑熱避難施設（クーリングシェルター）」のオープンデータを地図上で検索できる Web アプリケーションです。サイトを開くと現在地を取得し、最寄りのスポットと経路案内（徒歩／車）を提示します。

## プロジェクト構成

- `web/` – React + Vite で実装したフロントエンド
  - `public/data/cooling-shelters.csv` – 本番用データ。取得スクリプトで更新
  - `public/data/cooling-shelters.sample.csv` – 開発用のサンプルデータ
  - `scripts/fetch-cooling-shelters.ts` – 最新データを取得し UTF-8 に変換するスクリプト

## セットアップ

```bash
cd web
npm install
```

### 最新データの取得

```bash
npm run data:pull
```

- 既定では埼玉県オープンデータポータルの最新 CSV（resource 7279）を取得します。
- ダウンロードが制限されるネットワークでは、環境変数で URL や文字コードを調整してください。

```bash
COOLING_SHELTER_SOURCE_URL="https://example.com/csv" \
COOLING_SHELTER_SOURCE_ENCODING="utf-8" \
npm run data:pull
```

ポータル側の制限などで取得できない場合は、アプリ側が `public/data/cooling-shelters.csv` → `public/data/cooling-shelters.sample.csv` の順にフォールバックします。

### 開発サーバー

```bash
npm run dev
```

ブラウザーで `http://localhost:5173` を開きます。

### ビルド

```bash
npm run build
```

`dist/` に本番ビルドが出力されます。

## 主な機能

- 現在地の自動取得と最寄りスポットの強調表示
- 市区町村フィルター／キーワード検索
- OpenStreetMap + Leaflet による地図表示
- OSRM を利用した徒歩／車ルートの描画と所要時間表示
- Google マップへの連携リンク

## 備考

- 取得スクリプトは Shift_JIS → UTF-8 変換を行います。別形式で提供された場合は `COOLING_SHELTER_SOURCE_ENCODING` を調整してください。
- ルート検索は OSRM のパブリックエンドポイントを利用しています。アクセス制限を避けるため、必要に応じて自前のルーティングサービスへ差し替えてください。
