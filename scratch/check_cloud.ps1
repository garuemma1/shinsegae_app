$res = Invoke-RestMethod -Uri 'https://shinsegaeapp.vercel.app/api/sync' -Method Get
Write-Host "Employees count:" $res.data.employees.Count
$res.data.employees | Where-Object { $_.id -eq 'emp_2' } | ConvertTo-Json
Write-Host "PharmacistRates emp_2:" ($res.data.pharmacistRates.emp_2 | ConvertTo-Json)
