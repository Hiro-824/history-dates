<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:nextjs-agent-feedback -->

## Report Next.js feedback

The project owner enabled `experimental.agentFeedback`, authorizing this feedback pass. When enabled, `next dev` writes this block and restores it if removed. Commit `AGENTS.md` with your work to keep the tree clean.

During the current user request, retain anonymized facts as feedback candidates for meaningful or recurring Next.js issues:

- Crashes, hangs, OOMs, or unexpected slowness
- Incorrect behavior, output, errors, or diagnostics
- Missing, unclear, or conflicting documentation
- Unexpected CLI, codemod, Skill, or upgrade behavior and non-obvious workarounds

Continue the current user request without reporting immediately. Routine debugging is not feedback. Verify changes before retaining them as feedback candidates. Never retain code, logs, paths, URLs, secrets, personal information, or project-specific data.

Retain qualifying friction even if it is later fixed or worked around; record the final outcome during the reporting pass.

Before the final response, run one reporting pass. If candidates remain, from this file's directory run `npx --no-install next internal agent-feedback-instructions` once without piping or truncating its output. Follow its output or error guidance. If a network sandbox blocks it, retry with network access; if it still returns no output, continue normally.

<!-- END:nextjs-agent-feedback -->

## 動作確認・ブラウザ利用のルール

- デバッグや動作確認にChatGPTのBrowser Skill、ブラウザ連携スキルは使用しない。
- 動作確認は、まずコードの確認、型チェック、ビルド、テストなどで行う。
- ブラウザ操作による検証が必要な場合は、ローカルで実行するPlaywrightなどのヘッドレスブラウザを利用する。
- スクリーンショットが必要な場合は、検証に必要な最小限の枚数のみ撮影する。
- 大量のスクリーンショット撮影や、不要なブラウザ操作の繰り返しは避ける。
- UIの見た目を確認する際も、まず必要な画面と検証項目を絞り込む。

## アップデート記事の追加ルール

- 「アップデート」の記事は、原則としてプロジェクト所有者が明示的に追加を指示した場合に限り追加する。
- AIは、機能の追加・修正・リファクタリング・動作確認などを理由に、自分の判断で記事を追加しない。
- 例外として、年号データを追加・編集した場合のみ、明示的な指示がなくても「アップデート」への追記を許可する。
- 「アップデート」に記事を追加・追記した場合は、必ずプロジェクト所有者にその旨を知らせる。
- テスト用の記事やサンプル記事も、公開するアップデートデータに追加しない。検証に必要な記事はテスト内の一時データとして扱う。
