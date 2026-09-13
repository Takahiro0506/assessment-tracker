# 実クラウドへの接続手順

2026-09-13最新：所有者が `app.my-assessment-tracker.workers.dev` を承認済みドメインへ追加。公開設定読取APIで登録済みを確認した。以下の追加待ち・未登録は変更前の履歴。次は本人のGoogle認証完了と保存確認。

## 2026-09-13 本番配置済み（最新）

本人のデプロイ承認後、実D1の空状態を再確認し、SQLバックアップ→0001マイグレーション→Workersデプロイを実施した。本番は https://app.my-assessment-tracker.workers.dev/ 。個人名を含まないaccount subdomainへ変更し、Worker名をappへ移行後、旧Workerを削除した。workers_devを有効化し、preview_urlsは無効のまま。Firebase認証はデータを保護するが、入口とアカウント登録画面は公開される。Cloudflare Accessによる限定公開は設定していない。有料プラン・課金設定は変更していない。

### 所有者に残る設定

Firebase Console → Authentication → Settings → Authorized domains → Add domain に `app.my-assessment-tracker.workers.dev` を追加する（https://や末尾スラッシュなし）。読取APIで現時点では未登録を確認。Firebase CLIは未認証のため、管理設定の更新は行っていない。追加後に本番のメール／Googleログイン、保存、再読み込み、別端末同期を確認する。パスワードやトークンをチャットへ貼らない。

以下は配置前の準備手順と履歴。公開承認・migration・デプロイの待ち状態は上記で更新された。

この手順はアカウント所有者が必要な作業を具体化したもの。ローカル実装・検証は完了後もそのまま使える。現在のURLはlocalhostであり、実際のPC／スマホ間のクラウド同期は、下記接続と非公開テスト用の到達可能なURLが必要。

## 2026-09-12の現在地

- 本人よりFirebase SparkのWebアプリ、Email/Password・Google有効化、localhostの許可、Cloudflare FreeのD1作成完了の報告あり。
- 実ファイル名は `wrangler.production.example.jsonc`（`.example.json`ではない）。これを基に `app/wrangler.production.json` を作成済み。実DB IDとFirebaseのAPI key・project ID・auth domainを設定し、Git除外を確認した。共有された設定のMarkdownエスケープ `\_` は実際の `_` に戻している。
- API key以外の秘密鍵やアクセストークンは不要。storageBucket、messagingSenderId、appId、measurementIdは現在の認証実装では参照しないため追加していない。Analytics／Storageは有効化しない。
- 本番設定にAUTH_EMULATOR、demo project、ローカルDB IDは含めていない。現在のローカル試作の設定は変更していない。
- 公開範囲が未決定のため `workers_dev: false`、`preview_urls: false` とし、ルートは設定していない。公開許可後に到達可能なURLとアクセス制限を設定する。これらのフラグ自体を本人限定の認証機能と混同しない。
- 雛形にESModuleのrulesを追加し、ビルドされた分割JSも含めて梱包する。`npm run build` と `wrangler deploy --config wrangler.production.json --dry-run --outdir .wrangler/production-dry-run` が成功。49追加モジュール、資産20ファイル、gzip約315 KiB。dry-runはアップロードしない事前確認であり、実クラウドでの起動・CPU上限・D1接続成功の証明ではない。
- 本人のWrangler許可後、CLIログイン成功と指定D1のID・名前の一致を確認。実D1を読み取り、アプリ用テーブル0件（Cloudflare内部の_cf_KVのみ）、アプリ用トリガーなしを確認。SQL確認はchanges 0／rows_written 0。
- migration適用、Workerのアップロード、デプロイ、URL発行、プラン変更は未実施。Free/Sparkは本人申告で、CLIのwhoami／D1 infoだけでは課金プランを独立確認したことにはならない。

### CLIログインの手順（本人実施・完了確認済み）

1. Macの「ターミナル」を開く（Spotlightで「ターミナル」を検索）。
2. 下記2行を貼り付け、Enterを押す。

```sh
cd /Users/takahiro/Developer/assessment-tracker/app
npx wrangler login
```

3. 開いたブラウザで、今回D1を作成したCloudflareアカウントへログインする。メールアドレスやパスワードはそのCloudflare画面にだけ入力する。
4. Wranglerからのアクセス許可画面を確認し、同じアカウントであることを確認して `Allow`（許可）を押す。
5. ターミナルにログイン成功が表示されたら、チャットには「ログインできました」とだけ伝える。表示全体、認証URL、トークンは貼らなくてよい。

ブラウザが開かなければ、ターミナルに表示されたログイン用URLを自分のブラウザで開く。請求情報や有料プランの案内が現れた場合はその先へ進まず、機密情報を含めず画面の説明だけを伝える。

ログイン後は対象アカウント・FreeプランとDBを確認し、既存テーブルがあれば先にバックアップする。公開範囲を決める前にURLを発行しない。リモートmigrationはDB状態とユーザーの公開範囲方針を確認した段階で実行する。

公式資料：[Wranglerコマンド](https://developers.cloudflare.com/workers/wrangler/commands/)、[Preview URLの有効化・公開範囲](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/)。

### 次に必要な判断：テストURLのアクセス範囲

現時点では一般公開せず、指定した利用者だけの限定テストを提案する。Firebase認証は利用者ごとのデータを分離するが、アプリ入口や登録ページそのものを非公開にはしない。限定テストにはCloudflare Accessで当該Workerの全通信を保護し、許可したメールアドレスだけ通す構成を検討する。Accessの初期設定・プラン選択・承認画面が必要な場合は本人に案内する。有料化・請求情報入力へは進まない。

アクセス範囲の回答前にWorkerをアップロードしたりURLを有効にしたりしない。範囲決定後、URL無効の状態で準備し、アクセス制限を確認してから外部URLを有効化する。具体的な手順は選択した範囲とアカウントの設定状況に合わせて確定する。

出典：[Cloudflare AccessによるWorker単位の保護](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)。

## 1. Firebase側で必要な操作

1. [Firebase Console](https://console.firebase.google.com/) でプロジェクトを作成または選択する。**Sparkのまま**進め、Blaze・請求アカウントを有効化しない。Analytics・Firestoreは今回不要。
2. Authentication → Sign-in methodで **Email/Password** を有効にする。Googleを利用する場合はGoogleプロバイダーとサポートメールを設定する。SMS、メールリンク、Identity Platformは不要。
3. Project settings → Your appsでWebアプリを登録し、`apiKey`、`projectId`、`authDomain` を確認する。これらはWeb用の公開設定値。**サービスアカウント秘密鍵やGoogleのパスワードは渡さない。**
4. Authentication → Settings → Authorized domainsに、実際に使用する非公開テスト用ホストを登録する。実Firebaseでローカル確認する場合はlocalhostも必要。Googleログイン・メール送信は実サービスで別途確認する。
5. パスワードポリシーとメール列挙保護等をコンソールで確認する。SDK標準のパスワード認証を使い、アプリサーバーにパスワードを保存しない。

公開設定はアプリ内API `/api/config` から取得する。未設定ならログインできるように見せかけず、サンプルを案内する。

## 2. Cloudflare側で必要な操作

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) にログインし、Workers Freeを使用する。Paidへの変更・独自ドメイン購入は不要。
2. Storage & databases → D1で空の `assessment-tracker` DBを作り、Database IDを確認する。Freeの1DB上限500 MBに注意する。所在地・データの扱いは対象利用者と運用方針に合わせて確認する。
3. CLI作業を依頼する場合は、本人が `npx wrangler login` で認証する。トークンやパスワードをチャットやGitへ貼らない。
4. `app/wrangler.production.example.jsonc` を **Git除外済み** `app/wrangler.production.json` へコピーし、実DB ID・Firebaseの3設定を入力する。`AUTH_EMULATOR` を入れない。ローカル用の0000…IDを本番へ使わない。

ここまでの接続準備は公開ではない。非公開のテストURLをどの範囲へ公開するか確認した後に、スキーマ適用・デプロイへ進む。実D1は本人が作成済み。エージェントはリモートマイグレーション・デプロイを実行していない。

## 3. 接続後に行う作業

- 空DBへ `migrations/0001_workspace.sql` を適用する。既存DBなら先にSQLバックアップと内容確認。
- ビルド後、確認した実設定でWorkerとクライアント資産を配置する。必要な実行形式は `npx wrangler deploy --config wrangler.production.json`。**この文書の存在は公開承認ではない。実行前にアクセス範囲を確認する。**
- 公開を避ける評価用のアクセス制限は別途選択する。Firebaseログインによるデータ分離だけではサイトや新規登録自体を非公開にしない。
- 署名なしローカルトークンが拒否されること、Firebaseで発行した実トークンが成功することを確認する。
- PC／実スマホで同じテストアカウントにログインし、追加→30秒以内またはタブ復帰で反映、競合、サインアウト後のデータ分離を確認する。
- Googleログイン、パスワードリセットメールの到着、ドメイン制限、期限切れセッションを確認する。
- Workers CPU・リクエスト・D1容量を計測し、Free制限を満たすか確認する。特に10 ms CPUはローカル成功から保証できない。
- SQLを独立した保管先へ書き出し、復元演習後に評価用学生データを入れる。実D1 Time Travelの復元演習も、他ユーザーのデータがない評価DBで行う。

実サービスのアカウント設定、請求プランの選択、公開範囲はユーザー本人の判断が必要。それ以外のローカル実装と検証は先行して進めた。
