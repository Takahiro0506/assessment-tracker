# 認証・同期・復元の構成選定

公式仕様確認：2026-09-10〜11。小規模な学生向け商品の検証を無料枠から始めるための選択。無料で無制限に運営できるという判断ではない。

## 比較

| 項目 | Firebase Authentication + Firestore | Firebase Authentication + Workers/D1（採用） |
|---|---|---|
| 認証 | メール／パスワード・Googleを標準SDKで扱う | 同じFirebase Authを利用。WorkerでID tokenを検証する |
| 同期 | リアルタイムlistener・オフラインSDKがある。競合方針はアプリ設計が必要 | APIを自作。表示中30秒ポーリング、revision条件更新、再送IDで整合性を制御 |
| 利用者の分離 | Firestore Security Rulesを設計・検証 | Workerで検証したuidによるSQL絞り込み。DBの直接アクセスはクライアントに渡さない |
| 無料データ枠 | 1 GiB、読取50,000/日、書込20,000/日、削除20,000/日、送出10 GiB/月。無料対象DBは1つ | D1読取5,000,000行/日、書込100,000行/日、アカウント全体5 GB。ただしFreeの1DBは500 MB、最大10DB |
| サーバー制限 | 直接Firestore SDKなら別API不要。Cloud Functions等の追加機能は別条件 | Workers Freeは100,000リクエスト/日、CPU 10 ms/呼出、128 MB。SSRや大きいJSONの処理は実測が必要 |
| 管理復元 | PITR・管理バックアップ・復元は無料枠対象外、課金有効化が必要 | D1 Time TravelはFreeで過去7日、Paidで30日。DB全体の復元なので利用者別ごみ箱の代替にはならない |
| 運用負担 | SDKは簡単。無料の独立バックアップは別途設計 | Auth＋DBの2サービス、API・CAS・履歴を保守する。SQLエクスポートと検証が容易 |

出典：[Firestore料金・無料枠](https://firebase.google.com/docs/firestore/pricing)、[D1料金](https://developers.cloudflare.com/d1/platform/pricing/)、[D1制限](https://developers.cloudflare.com/d1/platform/limits/)、[Workers料金](https://developers.cloudflare.com/workers/platform/pricing/)、[Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)。

CloudflareのDB・Workersだけでは学生向けのメール／Googleログイン一式にならないため、認証は自作せずFirebaseを使う。Firestoreは同期実装の短さが強みだが、無料で利用できる管理復元機能と既存Cloudflare/Vinext構成を重視し、今回はD1を選んだ。30秒以内を目安に反映する個人向け管理なら、常時リアルタイムlistenerがなくても成立すると判断した（この部分は製品上の判断）。

## Firebase Authの制限

今回はSMS・メールリンクログインを使わず、メール／パスワードとGoogleを実装。Sparkのパスワードリセットメールは150件/日、確認メールは1,000件/日、メールリンクサインインは5件/日。新規作成はIPごと100アカウント/時。Identity PlatformにアップグレードしたSparkではTier 1が3,000 DAU、Tier 2が2 DAUという別上限がある。登録可能アカウント数と日次利用・送信制限は同義ではない。[Firebase Authentication Limits](https://firebase.google.com/docs/auth/limits)

この実装はIdentity Platformへのアップグレードを要求しない。無料枠・不正利用制限は変更され得るので公開時に再確認する。メール配送やGoogle OAuthの本番挙動はエミュレーターでは検証できない。

## 採用実装

`workspaces(owner PK, revision, data, operation_id, updated_at)` と `revisions(owner, revision, data, operation_id, updated_at)`。所有者はFirebase ID tokenからだけ取得する。revisionと直前のoperation_id（版トークン）が両方一致するUPDATE、または初回INSERTを1文で行い、同じ文のトリガーで保存版を追加する。同じアカウント・操作IDはunique。DB復元後に同じrevision番号が再登場しても、版トークンが異なれば古い画面からの更新を拒否する。サーバーのrevisionが端末で確認済みの値より小さい場合も、端末コピーの書き出しと再読み込みを促して同期を止める。履歴をクライアントから削除するAPIは設けない。

GETはprimaryから読み、認証付きレスポンスはno-store。エミュレーターではなく本番の場合、joseでRS256署名、issuer、audience、有効期限、iat、auth_time、subを確認する。[Firebaseの検証要件](https://firebase.google.com/docs/auth/admin/verify-id-tokens)、[D1セッションAPI](https://developers.cloudflare.com/d1/worker-api/d1-database/)。

失効検査を伴うFirebase Admin照会は行っていないため、アカウント無効化直後も発行済みトークンの有効期限までは通り得る（通常最大約1時間）。即時失効が必要になったらサーバー側の失効確認を追加する。GoogleメールアドレスをD1所有者には使わずuidを使うので、別アカウントをメール文字列で自動結合しない。

本番エミュレーター許可は不可。テスト用署名なしトークンの受入は、開発ビルド・demo project・明示的なフラグ・localhostの全条件がそろう場合のみ。`npm run build` では開発条件を除去する。

## 無料枠でどこまで始めるか

最初は10人程度の非公開評価を想定し、人数の保証とはしない。表示中1時間あたり約120回の同期GET。10人×2時間/日なら約2,400 GET/日（複数タブ・保存・画面配信・認証再試行等は別）。Workersの100,000回/日を使い切れば停止し得る。

保存版を毎回持つため、容量が先に問題になり得る。仮に平均20 KBの学期×10保存/日×10人×30日なら保存版だけで約60 MB。履歴が増えて100 KBなら約300 MB。SQLインデックス等も加算される。1アカウント400 KB上限は、DB全体500 MBを守る人数制限ではない。

D1の読み書き上限超過はエラーになり、Freeのまま自動的に無制限課金へ切り替わる構成にはしない。アプリは保存失敗を表示して端末コピーを残す。Workers 10 msのCPU上限は認証・SSR・JSON処理に影響する。ローカル試験では本番のCPU制限達成を証明できないので、非公開接続後に実測し、必要なら処理量や配信構成を縮小する。有料化で解決する場合は先に承認を得る。[WorkersのCPU定義・制限](https://developers.cloudflare.com/workers/platform/limits/)、[D1無料枠超過](https://developers.cloudflare.com/d1/platform/pricing/)

運用では日次でWorkerリクエスト数・CPU・D1使用量を確認し、目安70%で募集や保持方法を見直す。70%は運用目安でありサービスの保証ではない。自動の利用量通知、Bot対策、アカウントごとのレート制限は今回未実装。一般公開前に追加を判断する。

## 同期とバックアップを分ける

端末同期は誤削除や誤編集も伝える。ごみ箱・課題履歴・保存版は同一DB内なので、DB損失からは独立していない。D1 Time Travelはサービス内の7日間復元。別サービス障害・アカウント喪失・7日より前への備えは、ユーザーのJSONと運営者のSQLエクスポートを別の安全な場所に保管する。[運用手順](recovery-runbook.md)
