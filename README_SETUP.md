# CREATIVE STUDIO — FUNCTIONAL V6

V6 changes:
- 右上/画面上の同期ステータスバッジを非表示にしました。
- 自動同期そのものは引き続き動作します。
- 同期状態や手動操作は SETTINGS > クラウド同期 から確認できます。
- PWAキャッシュをV6へ更新しました。

# CREATIVE STUDIO — PC / iPhone 同期版

このフォルダは、既存のCREATIVE STUDIO V39をベースに、次を追加した実用版の土台です。

- ローカル保存を維持
- Supabaseログイン
- PC / iPhone間のクラウド同期
- PWA（iPhoneのホーム画面追加）
- 将来のApple Widget / Live Activityを見据えた正規化DBスキーマ

## 1. Supabaseを作る

1. Supabaseで新規Projectを作成
2. SQL Editorで `supabase-schema.sql` を実行
3. Project Settings → API から Project URL と anon key を確認
4. `config.js` に貼り付ける

```js
window.CREATIVE_STUDIO_CONFIG = {
  supabaseUrl: 'https://xxxxx.supabase.co',
  supabaseAnonKey: 'xxxxx'
};
```

## 2. 最初のログイン

アプリ右上（スマホは右下）の「ローカル」を押す → メール/パスワード → 「初回登録」。
SupabaseのAuth設定でEmail confirmationがONなら、確認メールを承認後にログインします。

## 3. 同期の仕組み

今のV39のデータ構造を壊さず、まず `app_state` のJSONBへ同期します。
操作するたびローカル保存し、ログイン中は約0.8秒後にクラウド保存します。
別端末でログインすると起動時にクラウドから読み込みます。

正規化テーブル（projects / deliverables / creative_tasks等）もSQLに用意済みです。次段階で画面単位に移行できます。

## 4. iPhoneでアプリっぽく使う

HTTPSで公開したURLをSafariで開き、共有 → 「ホーム画面に追加」。
PWAとして単独ウインドウで起動します。

## 5. 公開方法

Cloudflare Pages / Vercel / GitHub Pagesなどの静的ホスティングに、このフォルダ一式を配置します。
`config.js` は公開されるため、必ずSupabaseの **anon key** のみを使い、service_role keyは絶対に置かないでください。
RLSが自分のデータを保護します。

## 次の実装候補

- `app_state`から正規化テーブルへの移行
- 「いまやる」API / View
- 作業セッションのクラウド化
- Apple WidgetKit用の読み取りAPI
- Live Activity用の作業中状態


## V4 自動同期
- 変更後約0.6秒で自動保存
- オフライン時はローカル保存し、再接続時に自動送信
- アプリへ戻った時と30秒ごとにクラウドの更新を確認
- 右下の同期表示で「変更あり / 保存中 / 保存済 / 未同期」を確認できます。
