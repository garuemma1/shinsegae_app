[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$fbUrl = 'https://shinsegae-pharmacy-default-rtdb.firebaseio.com/shinsegae_master_db/data.json'
$res = Invoke-RestMethod -Uri $fbUrl -Method Get

$jsonStr = $res | ConvertTo-Json -Depth 10
$matches = [regex]::Matches($jsonStr, '.*모드콜.*')
foreach ($m in $matches) {
    Write-Host $m.Value
}
