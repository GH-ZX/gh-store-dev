$ErrorActionPreference = 'Stop'
$root = 'C:\Users\Administrator\Coding\gh-store-dev'
$u = (Get-Content "$root\.env.local" | Where-Object { $_ -match '^NEXT_PUBLIC_SUPABASE_URL=' }) -replace '^NEXT_PUBLIC_SUPABASE_URL=',''
$s = (Get-Content "$root\.env.local" | Where-Object { $_ -match '^SUPABASE_SERVICE_ROLE_KEY=' }) -replace '^SUPABASE_SERVICE_ROLE_KEY=',''
$h = @{ apikey = $s; Authorization = "Bearer $s"; 'Content-Type' = 'application/json'; Prefer = 'return=representation' }

$cut = [datetime]::Parse('2026-09-10T00:00:00Z').ToUniversalTime()
$all = Invoke-RestMethod -Uri ($u + '/rest/v1/recharge_requests?select=id,reference,status,created_at,wallet_credit_amount,payment_tx_hash') -Headers $h
$targets = @($all | Where-Object {
  $_.status -eq 'rejected' -and
  ([double]($_.wallet_credit_amount ?? 0) -eq 0) -and
  (-not $_.payment_tx_hash) -and
  ([datetime]$_.created_at).ToUniversalTime() -lt $cut
})
"candidates: $($targets.Count)"
$targets | ForEach-Object { "   {0} {1}" -f $_.reference, $_.created_at }
$ids = @($targets | ForEach-Object { $_.id })
$filter = 'in.(' + ($ids -join ',') + ')'

foreach ($t in 'sam_invoices','binance_invoices') {
  $uri = $u + "/rest/v1/$t`?status=eq.expired&paid_at=is.null&credited_at=is.null&recharge_request_id=" + [uri]::EscapeDataString($filter)
  $del = Invoke-RestMethod -Uri $uri -Headers $h -Method Delete
  "$t rows deleted: $(@($del).Count)"
}

$uri2 = $u + '/rest/v1/recharge_requests?id=' + [uri]::EscapeDataString($filter)
$del2 = Invoke-RestMethod -Uri $uri2 -Headers $h -Method Delete
"recharge_requests deleted: $(@($del2).Count)"

$note = ' [TEST-REVIEW: likely an owner test attempt; kept because the note could describe a real failed transfer. Safe to reject/delete after confirming.]'
foreach ($ref in 'RC-E08E876B2C','RC-4F1D1CAFB1') {
  $body = @{ admin_note = $note } | ConvertTo-Json -Compress
  $r = Invoke-RestMethod -Uri ($u + "/rest/v1/recharge_requests?reference=eq.$ref&status=eq.rejected") -Headers $h -Method Patch -Body $body
  "annotated $ref -> $(@($r).Count) row(s)"
}

$after = Invoke-RestMethod -Uri ($u + '/rest/v1/recharge_requests?select=reference,status,wallet_credit_amount,admin_note') -Headers $h
"AFTER total=$($after.Count)"
$after | Group-Object status | ForEach-Object { "  {0} = {1}" -f $_.Name, $_.Count }
"credited total = " + ($after | Measure-Object -Property wallet_credit_amount -Sum).Sum
$dep = Invoke-RestMethod -Uri ($u + '/rest/v1/wallet_transactions?select=id,type,amount&type=eq.deposit') -Headers $h
"deposits unchanged: $($dep.Count) rows, sum " + ($dep | Measure-Object -Property amount -Sum).Sum
