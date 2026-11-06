# 年号投稿のFirebase設定

## 接続設定

`.env.example` をもとに `.env.local` を作成し、Webアプリの `apiKey`、`authDomain`、`projectId`、`appId` を設定します。ローカルには提供済みの値を設定しています。`.env.local` はGitに含まれません。

公開先でも同じ `NEXT_PUBLIC_FIREBASE_*` 環境変数を設定し、**再ビルドして公開**してください。これらの値はWeb公開用の識別情報です。サービスアカウントや秘密鍵は不要です。Analytics、Storage、Cloud Functionsは使用しません。

1. Firebase ConsoleでFirestore Databaseの **Standard edition / `(default)` データベース** を本番モードで作成します。
2. Authentication → ログイン方法 → 匿名を有効にします。
3. Firestore → ルールに、リポジトリの [`firestore.rules`](../firestore.rules) 全文を貼り付けて公開します。「テストモード」や全件読み書き許可にはしません。

CLIを使う場合は、対象のプロジェクトIDを明示します。

```sh
firebase deploy --only firestore:rules --project <プロジェクトID>
```

このルールは `submissions`、`submissionLimits`、`reports`、`reportLimits` のみを許可し、その他のコレクションは拒否します。既存の別用途のデータがあるプロジェクトでは、既存ルールを確認して統合してください。クライアント側でコレクションを事前作成する必要はありません。

## App Check（任意・必要になったら追加）

今回の初期運用ではApp Checkを使用しません。`NEXT_PUBLIC_FIREBASE_RECAPTCHA_SITE_KEY` は未設定のままで動作します。まず匿名ユーザーID単位の連投制限で運用し、必要になった場合に以下を追加できます。

1. Firebase Console → App CheckからWebアプリを登録します。
2. reCAPTCHA Enterpriseを選び、公開先のホスト名を許可したWebサイトキーを作成します。
3. サイトキーを `NEXT_PUBLIC_FIREBASE_RECAPTCHA_SITE_KEY` に設定して再ビルド・公開します。
4. App Checkのリクエスト状況を確認し、**Cloud Firestoreで適用を有効化**します。サイトキーの設定だけでは強制されません。

本番で適用を有効化した後のlocalhost検証には、Firebase公式のApp Checkデバッグプロバイダを使うか、下記のEmulatorを使います。デバッグトークンを本番に組み込まないでください。

公式資料：[匿名認証](https://firebase.google.com/docs/auth/web/anonymous-auth)、[App Check / reCAPTCHA Enterprise](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider)。

## 投稿と出題

- ホーム・問題一覧の「＋ 年号を投稿」から `/submit` に移動できます。
- 投稿には出来事、1〜9999の年、紀元、科目、地域、投稿前の重複確認が必要です。単元と備考は任意です。
- 投稿前に「同じ年号の既存データを確認」を押すと、同年・同紀元の既存問題と公開中の投稿を科目を問わず表示します。確認チェックが必須です。入力内容の変更でチェックは解除され、年号・紀元の変更時には対象年の再確認が必要です。取得に失敗した場合は投稿できません。出典URLは収集しません。
- 投稿直後は `reviewStatus: "unverified"`、仮の優先度です。優先度は任意で1〜5から選択でき、未指定の場合は `priority: 3` になります。内容は公開されます。氏名・メールアドレスは収集しません。
- 通常は未確認問題を出題しません。ホームの「投稿後未確認の問題は出題しない」のチェックを外した場合だけ対象になります。科目・単元・地域・星の条件は投稿にも適用されます。
- 単元未分類の投稿は、全範囲ランダム・地域×時代で出題できます。単元選択では対象になりません。
- 問題一覧には未確認・確認済みの投稿を表示します。リロードアイコンまたはページ再読み込みで最新状態を取得します。
- 読み込み対象はドキュメントID順の先頭500件です。上限に到達すると画面に表示します。募集が増えたらページング・配信方式を拡張してください。
- 通信失敗時も既存問題で学習できます。開始したセッションには投稿問題のコピーを保存するため、再読み込み時に通信できなくても継続できます。
- セッション中は開始時点の問題と確認状態を保ちます。確認後の新しい学習では更新後の内容を使います。学習中に内容が変わって解答判定が変わることを防ぎます。
- 非公開化後の新規取得・新規出題からは除外します。既に取得した画面や保存済みセッションのコピーを遠隔削除する機能はありません。

## 管理者の操作

Firebase Console → Firestore → データ → `submissions` で投稿を確認します。

| 操作 | 変更する項目 |
| --- | --- |
| 確認済みにする | `reviewStatus` を `verified` に変更 |
| 非公開にする | `reviewStatus` を `hidden` に変更 |
| 訂正する | `name`、`year`、`era`、`note` などを編集 |
| 分類・優先度を調整する | `unitId`、`regionId`、`priority` を編集 |

**ドキュメントIDは変更しません。** 学習履歴が `community-<ドキュメントID>` を参照しています。`unitId` は `data/units.ts` の小単元ID、`regionId` は `data/regions.ts` の地域IDです。科目と一致させてください。未分類は `unitId: ""`。公開可能な優先度は1〜5です。入力形式に合わないデータは画面に読み込まれません。

`reports` は問題詳細からの報告です。`eventId` が該当する `submissions` のドキュメントIDです。一般利用者は報告を閲覧できません。クライアントから投稿の編集・確認・削除はできず、管理者はConsoleのIAM権限で操作します。

投稿・報告それぞれに、匿名ユーザーID単位の60秒の連投制限をFirestore Rulesで適用します。制限用ドキュメントと投稿・報告を同一トランザクションで保存します。匿名IDを作り直す行為を完全に防ぐ制限ではありません。利用量・通報内容を確認し、必要になったらApp Checkを追加します。

## ローカルの検証

通常の検証：

```sh
npm test
npm run lint
npm run build
```

ルール検証はJava 21以上とFirebase CLIが必要です。**demoプロジェクトだけ**を使用し、本番へのテスト投稿は行いません。

```sh
firebase emulators:exec --only firestore --project demo-history-dates 'npm run test:rules'
```

ブラウザから投稿まで検証する場合は、次の2コマンドを別々のターミナルで実行します。

```sh
firebase emulators:start --only firestore,auth --project demo-history-dates
```

```sh
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-history-dates NEXT_PUBLIC_FIREBASE_EMULATORS=1 npm run dev -- --hostname 127.0.0.1 --port 3106
```

このEmulator接続は開発モードかつ `demo-` で始まるプロジェクトIDの場合だけ有効です。ブラウザ検証にも通常のChromeプロファイルは使わず、一時プロファイルのヘッドレスChromeを使います。

Emulatorと開発サーバーの起動後、投稿・未確認問題の出題・オフライン復元・報告・連投制限・確認済み化・非公開化をまとめて検証できます。このテストはdemoデータベースを初期化し、スクリーンショットは撮影しません。

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 HISTORY_BASE_URL=http://127.0.0.1:3106 HISTORY_COMMUNITY_ONLY=1 HISTORY_SCREENSHOT=0 npm run test:browser
```
