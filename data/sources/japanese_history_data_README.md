# 日本史年号データ（57〜1945年）

## ファイル

- `japanese_history_years.csv`: UTF-8 BOM付きCSV。スプレッドシート・Codexで扱いやすい。
- `japanese_history_years.json`: 同一データのJSON配列。プログラムでそのまま読み込める。

## スキーマ

| フィールド | 型 | 内容 |
|---|---|---|
| `id` | string | 年代順の一意なID (`JP0001` など) |
| `year` | integer | 西暦年 |
| `event` | string | 出来事。音声入力由来の明らかな表記・年号誤りは修正済み |
| `note` | string | ユーザー自身が発言した語呂・補足のみ。なければ空文字列 |
| `origin` | string | `user`: 元メモ由来、`added`: 重要な欠落を補ったもの |

各行は一つの出来事。同年の複数項目は別行で、`year` の昇順。年代区分など、元メモになかった説明列は設けていない。

## 編集上の判断

- 1806年の薪水給与令を削除（1842年の天保の薪水給与令は指定に従い残した）。
- ユーザーが削除を指定した1875年の江華島事件は追加していない。
- 1868年の鳥羽・伏見の戦いと戊辰戦争開始は、ユーザーの指定どおり一項目に統合。
- 1615年の諸法令、1609年の各出来事等は独立項目。
- 元メモ中の1513→1510年三浦の乱、1902→1904年日露戦争、1927→1928年張作霖爆殺事件などは歴史的な年に補正した（出典区分は元メモ由来の `user` を維持）。
- 1840年のアヘン戦争情報は、同年からオランダ別段風説書が提出されている史実に沿って記載。
- 1862年の「朝廷上意を結構」は出来事を特定できないため未収録（原文確認が必要）。
- 1592年の文禄の役は、元メモには年のみで出来事名が不明だったため、`added` として収録。
- 1938年の3回の近衛声明は、元メモの「三度の近衛声明」に対応して3行に分けた。

## 照合用の参考資料（データの補足欄には含めない）

- 国立公文書館・年表： https://www.archives.go.jp/exhibition/digital/rekishitomonogatari/history01.html
- 国立公文書館・日本のあゆみ： https://www.archives.go.jp/ayumi/table.html
- 国立公文書館・幕末： https://www.archives.go.jp/exhibition/digital/henbou/history.html
- 国立国会図書館・幕末明治の歴史事典： https://www.kodomo.go.jp/yareki/chronology/index.html
- 国立国会図書館・阿片戦争関連： https://www.ndl.go.jp/nichiran/s1/s1_4.html
- 外務省・改税約書： https://www.mofa.go.jp/mofaj/annai/honsho/shiryo/akebono/17.html
