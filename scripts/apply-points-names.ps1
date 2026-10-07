$ErrorActionPreference = 'Stop'
$root = 'C:\Users\Administrator\Coding\gh-store-dev'
$u = (Get-Content "$root\.env.local" | Where-Object { $_ -match '^NEXT_PUBLIC_SUPABASE_URL=' }) -replace '^NEXT_PUBLIC_SUPABASE_URL=',''
$s = (Get-Content "$root\.env.local" | Where-Object { $_ -match '^SUPABASE_SERVICE_ROLE_KEY=' }) -replace '^SUPABASE_SERVICE_ROLE_KEY=',''
$h = @{ apikey = $s; Authorization = "Bearer $s"; 'Content-Type' = 'application/json'; Prefer = 'return=representation' }

$updates = @(
  @{ slugs = @('mlbb','mlbb-special','mlbb-exclusive'); en = 'Diamonds';          ar = [char]0x0623 + [char]0x0644 + [char]0x0645 + [char]0x0627 + [char]0x0633 + [char]0x0629 },
  @{ slugs = @('genshin');                          en = 'Genesis Crystals';    ar = ([char]0x0628 + [char]0x0644 + [char]0x0648 + [char]0x0631 + [char]0x0629 + ' ' + [char]0x062A + [char]0x0643 + [char]0x0648 + [char]0x064A + [char]0x0646) },
  @{ slugs = @('honkai-star-rail');                 en = 'Oneiric Shards';      ar = ([char]0x0634 + [char]0x0638 + [char]0x064A + [char]0x0629 + ' ' + [char]0x062D + [char]0x0644 + [char]0x0645) },
  @{ slugs = @('zzz');                              en = 'Monochromes';         ar = ([char]0x0645 + [char]0x0648 + [char]0x0646 + [char]0x0648 + [char]0x0643 + [char]0x0631 + [char]0x0648 + [char]0x0645) },
  @{ slugs = @('arena-breakout','arena-breakout-infinite'); en = 'Coins';       ar = ([char]0x0643 + [char]0x0648 + [char]0x064A + [char]0x0646 + [char]0x0632) },
  @{ slugs = @('deltaforce');                       en = 'Delta Coins';         ar = ([char]0x062F + [char]0x0644 + [char]0x062A + [char]0x0627 + ' ' + [char]0x0643 + [char]0x0648 + [char]0x064A + [char]0x0646) },
  @{ slugs = @('bloodstrike');                      en = 'Gold';                ar = ([char]0x0630 + [char]0x0647 + [char]0x0628) },
  @{ slugs = @('freefire-me','freefire-eu','freefire-global'); en = 'Diamonds'; ar = ([char]0x0623 + [char]0x0644 + [char]0x0645 + [char]0x0627 + [char]0x0633 + [char]0x0629) },
  @{ slugs = @('pubgm');                            en = 'UC';                  ar = 'UC' }
)

foreach ($row in $updates) {
  $filter = 'in.(' + ($row.slugs -join ',') + ')'
  $body = @{ points_name_en = $row.en; points_name_ar = $row.ar } | ConvertTo-Json -Compress
  $uri = $u + '/rest/v1/products?slug=' + [uri]::EscapeDataString($filter)
  $res = Invoke-RestMethod -Uri $uri -Headers $h -Method Patch -Body $body
  "updated {0} row(s) -> en='{1}' ar='{2}'" -f @($res).Count, $row.en, $row.ar
}
