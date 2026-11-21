# CharaCardArena

自作のキャラクターカードを作って保存し、チームを組んで自動で戦わせるシミュレーター。

- **カード**: 画像1枚（63:88 で切り抜き）・名前・属性・スタイル・戦法・説明文
- **チーム**: 1〜6人。前線3枠＋待機（最大3）。前線が倒れると待機が順番にその位置へ入る
- **対戦**: 同じ人数のチーム同士で自動戦闘。エフェクト付きの演出と戦闘ログ
- **履歴**: 直近50件を自動保存（お気に入りは無期限）。ログの読み返しとリプレイ（シーク・速度変更）
- **ルール**: アプリ内の「ルール」タブに、属性効果・スタイル・戦法の説明がある

## 保存先

claude.ai のアーティファクトとして開くと、データは閲覧者ごとの非公開領域（`db` capability）、
画像はアセット置き場（`assets` capability）に保存され、同じアカウントならスマホと PC で共有される。
それ以外の環境（ローカル開発など）では、ブラウザの IndexedDB に保存される（画面右上に「この端末のみ」と表示）。

## 構成

```
src/core/      戦闘ルール（画面に依存しない純粋な TypeScript）
  elements.ts  属性・相性・属性効果の数値
  styles.ts    スタイル（能力値の配分）と戦法
  engine.ts    戦闘シミュレーション（シード固定で再現可能）
  battle.ts    チーム→戦闘用データ変換、リプレイ用の状態、戦闘ログ文章
src/fx/fx.ts   キャンバスによる戦闘エフェクト
src/storage/   保存層（claude.ai / IndexedDB）と画像処理
src/ui/        画面（React）
tests/         エンジンのテストとバランス確認
scripts/build-artifact.mjs  ビルド結果をアーティファクト用 HTML に変換
```

## コマンド

```sh
npm install
npm run dev        # 開発サーバー（IndexedDB 保存）
npm test           # テスト＋バランスレポート
npm run build      # dist-artifact/characard-arena.html を生成（アーティファクトとして公開するファイル）
```

公開時の capabilities: `{ "db": {}, "user": {}, "assets": {} }`

## バランス調整

数値は `src/core/elements.ts`（`FX`）と `src/core/styles.ts`（`STYLES`）に集約している。
`npm test` の出力に、ランダム編成での属性・スタイル・戦法ごとの勝率と、
単一属性チーム同士の勝率表が出るので、それを見ながら調整する。
