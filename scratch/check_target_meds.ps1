$res = Invoke-RestMethod -Uri 'https://shinsegae-pharmacy-default-rtdb.firebaseio.com/.json' -Method Get
$meds = $res.shinsegae_master_db.data.medicineLocations

$targets = @('현대 마이녹실', '정산마그네슘', '둥근머리버물리겔', '모스세이프', '일자박세티', '센코프액', '마그리민', '롤리팝', '트로전')

foreach ($t in $targets) {
    $found = $meds | Where-Object { $_.name -like "*$t*" }
    if ($found) {
        $hasP = if ($found.photoUrl) { "Length: $($found.photoUrl.Length) (Starts with: $($found.photoUrl.Substring(0, [Math]::Min(20, $found.photoUrl.Length))))" } else { "EMPTY / NULL" }
        Write-Host "[$($found.name)] -> photoUrl: $hasP"
    } else {
        Write-Host "[$t] NOT FOUND in DB"
    }
}
