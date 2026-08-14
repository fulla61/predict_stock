# ロジックテスト

Apps Script のうち、GAS API に依存しない純粋ロジックを Node で検証する。
営業日計算・支払期限の算出・件名解析・ステータス遷移が対象。

```
node automation/test/logic.test.js
```

祝日カレンダーはスタブで「土日のみ休み」として扱うため、
祝日を含む期間の営業日数は本番と一致しない。カレンダーの疎通は
Apps Script 側の `healthCheck()` で確認すること。
