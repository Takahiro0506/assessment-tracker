# Assessment Tracker

TAFE/VET学生が「自分の学期を組み立てる」アセスメント管理Webアプリ。AIを使って学生向けの商品を開発し、小さな利益につながるか検証する。アプリ内AI・課金機能は含めない。

## 現在地（2026-09-13）

### 本番デプロイ済み（最新）

本人の本番デプロイ承認により、Cloudflare Workersへ配置済み：[本番アプリ](https://app.my-assessment-tracker.workers.dev/)。個人名を含まないaccount subdomainへ変更し、Worker名をappへ移行後、旧Workerを削除した。実D1の事前SQLバックアップと0001マイグレーションが成功。入口・登録画面は公開、課題データはFirebase認証で利用者ごとに分離する。有料プランへの変更なし。

本番のページ／設定APIは200、未認証の課題・履歴APIと署名なしトークンは401を確認。Firebaseの承認済みドメインへの `app.my-assessment-tracker.workers.dev` 追加が未完了。実ログイン・保存・実機間同期は未検証のため、学生データを入れる前に確認する。以下の「未デプロイ」は本番配置前の履歴。

2026-09-13：本人指定のGitHubリポジトリ `Takahiro0506/assessment-tracker` へ `codex/assessment-record` ブランチをpush済み。設定例 `.env.example` を共有対象に含め、本番設定・端末データは除外した。結果待ち日数は端末のカレンダー日付で計算し、日付境界と夏時間をテストした。

2026-09-13追記：採用方向を継続し、読みやすさを調整。カードの日付・操作は16px、提出記録と補助情報は14pxを基準にし、狭い画面では列数と折り返しで対応する。

B案の安全なデータ基盤を維持したまま、採用済みA-02（PC）／A-03（スマホ）の提出記録中心UIを同じ `app/` に実装。アイボリー・深緑・控えめな科目カラーの英語UIで、名前だけの追加、4つの期限区分、提出・結果待ち・完了・再提出、ごみ箱・履歴・バックアップを扱う。

**Firebase Authentication＋Cloudflare Workers/D1を採用。認証・同期API・競合検出・復元を実装し、ローカル認証エミュレーターとD1で検証済み。最新の自動テスト40件・型チェック・lint・ビルドが成功。本人のFirebase／D1作成は完了報告済み。本番設定はGit除外。Cloudflare CLI認証と実D1の読取接続も確認済み。最終読取時の実D1のアプリ用テーブルは0件で、migration・デプロイ・実機間確認は未実施。** GitHubへの開発ブランチ共有は実施済み。一般公開、有料契約は行っていない。価格・需要・支払意思は未検証。

最終仕上げでは、カード内の科目追加、提出前の確認、スマホの固定入力と科目集計の開閉を改善した。実機のソフトウェアキーボードと初見学生による評価は未実施で、PC上のスマホ幅検証とは区別する。

- [構成比較・無料枠・採用理由](docs/cloud-architecture.md)
- [外部アカウント設定と接続手順](docs/cloud-setup.md)
- [バックアップ・復元の運用手順](docs/recovery-runbook.md)
- [最新仕様](docs/product-brief.md)、[作業状況](docs/tasks.md)、[検証記録](docs/verification.md)
- [B案の元モックと解釈](docs/mockups/b-design-review.md)

## ローカル起動

Node.js 22.13以上、npm。アプリはReact・TypeScript・Vinext/Vite。各コマンドは `app/` で実行する。

```sh
cd /Users/takahiro/Developer/assessment-tracker/app
npm ci
npm run db:local
npm run emulators
```

もう一つのターミナルで：

```sh
cd /Users/takahiro/Developer/assessment-tracker/app
npm run dev:local
```

[ローカル画面](http://localhost:3001/) を開く。`Create account` から架空のメールアドレスとテスト専用パスワードで登録する。データはローカルD1、認証はlocalhost:9099のFirebaseエミュレーター。画面に **Local test service** と表示する。実クラウドには送らない。エミュレーターは通常終了時に `.emulator-data/` へアカウントを保存する。端末間の実運用には [接続手順](docs/cloud-setup.md) が必要。

`npm run dev` は実Firebase設定を読む開発起動。未設定ならサンプルのみ利用可能。`.env.example` を参考に `.dev.vars` を設定する。`dev:local` と通常起動を混同しない。

## 試し方

1. 一覧の入力欄に課題名を入力しEnter（スマホではAddボタン）で追加。科目・締切はカードの `+ Unit` / `+ Due date` から後付けする。空一覧の `Explore a sample semester` は1クリックで見本を開き、自分のデータには触れない。
2. まとめて入力する場合は `Add several at once` → 科目を一度入力 → `Another assessment`。Assessment 1などの初期値は編集可能。期限は任意。日付のカレンダー／直接入力と読み返し表示は維持。
3. `Save … assessments` でまとめて保存。下書きは端末・アカウントごとに保全し、戻る・再読み込み後も `Resume a saved draft` から再開できる。科目選択を変えると編集中カードの所属を変える。
4. `My semester` は月別／科目別。Next upで直近の作業を示し、今日締切と超過日数を明示。期限超過と期限未定は独立表示。月数やカード数をモックに合わせて省略しない。
5. `Mark submitted` → 注意書きを確認して `Confirm submitted` → `Submissions` の `Record result` → `Completed` または `Needs resubmission`。学校への提出操作ではなく、自分の提出記録。以前の期限・提出日時・訂正内容をHistoryに残す。完了は `Undo completion` で戻せる。
6. 編集画面から `Move to trash`。Settings → `Trash` から履歴ごと戻す。完全削除・自動消去は実装していない。
7. Settingsの `Export backup` で別コピーを保管。`Backup & recovery` は旧localStorageデータ／JSONの内容を検証し、追加・スキップ・復旧コピーの件数を確認して取り込む。現在のデータを丸ごと置き換えない。
8. 同じアカウントの別画面には、表示中30秒ごと／タブ復帰時に反映。確認済みの保存のみSavedを4秒表示。未保存や失敗は解決まで表示する。競合は両方をダウンロードでき、`Keep both versions` で異なるカードを復旧コピーとして残せる。

保存待ちは1操作ずつ。通信切断時は未同期コピーを保全し、再接続で再送する。その間の追加保存は止める（編集中の下書きは保持）。再読み込み後は同じアカウントで `Resume sync`。完全なオフライン起動やバックグラウンド同期は未対応。

## 検証コマンド

```sh
npm test
npm run test:integration
npm run test:client
npm run typecheck
npm run lint
npm run build
```

統合テストは独立した一時D1を使い、開発データを変更しない。画面側の通信失敗・容量不足はJSDOMで検証する。ブラウザ目視の範囲と実クラウド未検証項目は [検証記録](docs/verification.md) を参照。

## 再設計前の保全

2026-09-10 21:56時点の追跡・未追跡ファイル126件を、リポジトリ外の `/Users/takahiro/Developer/assessment-tracker-recovery/20260910-215651/` に退避済み。`before-b.tar.gz`、各ファイルのSHA-256 manifest、Git差分とstatusを保存し、全ファイルを照合した。依存パッケージ・ビルド生成物・Git内部は除外。復元は空の別フォルダへ展開して比較し、現行作業へ直接上書きしない。`Claude outputs/` と元のモック画像は変更していない。

GitHubへのソース共有は2026-09-13に実施済み。アプリのデプロイ・外部公開は未実施。

## 初見評価

2026-09-12の第三者レビューをもとに、最初の入力・見本・締切表示・設定への整理を実施。アカウント不要モードは初見評価後に判断する。[説明なしで試す記録用紙](docs/first-use-evaluation.md)を使用する。
