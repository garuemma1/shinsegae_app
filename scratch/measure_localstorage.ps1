$fbUrl = "https://shinsegae-pharmacy-default-rtdb.firebaseio.com/shinsegae_master_db/data.json"
$liveData = Invoke-RestMethod -Uri $fbUrl -Method Get

$storageMapping = [ordered]@{
    "ssg_worklogs_v1"                   = $liveData.worklogs
    "ssg_paystubs_v1"                   = $liveData.paystubs
    "ssg_schedule_v1"                   = $liveData.schedule
    "ssg_medicine_locations_v1"         = $liveData.medicineLocations
    "ssg_rx_medicine_locations_v1"      = $liveData.rxMedicineLocations
    "ssg_notices_v1"                    = $liveData.notices
    "ssg_employees_v1"                  = $liveData.employees
    "ssg_building_rental_dashboard_v1"  = $liveData.buildingRentalDashboard
    "ssg_emp_permissions_v1"            = $liveData.empPermissions
    "ssg_deleted_ids"                   = $liveData.deletedIds
    "ssg_discount_purchases_v1"         = $liveData.discountPurchases
    "ssg_expiry_returns_v1"             = $liveData.expiryReturns
    "ssg_supply_presets_v1"             = $liveData.supplyPresets
    "ssg_schedule_status_v1"            = $liveData.scheduleStatus
    "ssg_supplies_v1"                   = $liveData.supplies
    "ssg_leave_requests_v1"             = $liveData.leaveRequests
    "ssg_overtime_adjustments_v1"       = $liveData.overtimeAdjustments
    "ssg_pharmacist_rates_v1"           = $liveData.pharmacistRates
}

$results = @()
$totalBytes = 0

foreach ($entry in $storageMapping.GetEnumerator()) {
    $key = $entry.Key
    $val = $entry.Value
    
    $json = if ($null -ne $val) { $val | ConvertTo-Json -Depth 10 -Compress } else { "[]" }
    $charCount = $key.Length + $json.Length
    $byteSize = [System.Text.Encoding]::UTF8.GetByteCount($json) + $key.Length
    $totalBytes += $byteSize
    
    $count = 1
    if ($val -is [System.Collections.IEnumerable] -and $val -isnot [string]) {
        $count = $val.Count
    }
    
    $results += [PSCustomObject]@{
        Key        = $key
        Count      = $count
        SizeBytes  = $byteSize
        SizeKB     = [Math]::Round($byteSize / 1024, 2)
        Characters = $charCount
    }
}

foreach ($r in $results) {
    $p = [Math]::Round(($r.SizeBytes / $totalBytes) * 100, 2)
    $r | Add-Member -NotePropertyName "Percent" -NotePropertyValue $p
}

$totalKB = [Math]::Round($totalBytes / 1024, 2)
$totalMB = [Math]::Round($totalBytes / 1024 / 1024, 3)
$limitMB = 5.0
$remainingMB = [Math]::Round($limitMB - $totalMB, 3)
$usedPercent = [Math]::Round(($totalMB / $limitMB) * 100, 2)
$freePercent = [Math]::Round(100 - $usedPercent, 2)

Write-Host "Total Size: $totalKB KB ($totalMB MB)"
Write-Host "Quota Limit: 5120 KB (5.0 MB)"
Write-Host "Remaining Space: $remainingMB MB ($freePercent percent FREE)"
Write-Host "Quota Used: $usedPercent percent"
Write-Host "------------------------------------------------------------"

$results | Select-Object Key, Count, SizeKB, Percent | Format-Table -AutoSize

$results | ConvertTo-Json | Set-Content "c:\Users\win10\Desktop\shinsegae_app\scratch\storage_report.json" -Encoding UTF8
