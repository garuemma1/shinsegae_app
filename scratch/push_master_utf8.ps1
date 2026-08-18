$jsonText = @'
{
  "emp_1": { "name": "문성도", "role": "약국장", "pos": "대표약사", "pay": "DIRECTOR", "date": "2020-03-01", "wRate": 45000, "hRate": 45000, "sal": 0, "phone": "010-3679-0000", "user": "director@shinsegae.com", "pass": "367900" },
  "emp_2": { "name": "권명주", "role": "근무약사", "pos": "조제팀장", "pay": "HOURLY", "date": "2024-09-06", "wRate": 80000, "hRate": 20000, "sal": 0, "phone": "010-2385-0402", "user": "iniha@naver.com", "pass": "1234" },
  "emp_3": { "name": "양윤지", "role": "근무약사", "pos": "DUR검수약사", "pay": "HOURLY", "date": "2023-10-04", "wRate": 25000, "hRate": 27000, "sal": 0, "phone": "010-4726-9807", "user": "yang@shinsegae.com", "pass": "1234" },
  "emp_4": { "name": "김동완", "role": "근무약사", "pos": "야간담당약사", "pay": "HOURLY", "date": "2026-03-01", "wRate": 23000, "hRate": 23000, "sal": 0, "phone": "010-8236-9650", "user": "kimdw@shinsegae.com", "pass": "1234" },
  "emp_5": { "name": "유호종", "role": "근무약사", "pos": "신약/약품관리", "pay": "HOURLY", "date": "0001-01-01", "wRate": 25000, "hRate": 27000, "sal": 0, "phone": "010-4055-5860", "user": "yoo@shinsegae.com", "pass": "1234" },
  "emp_6": { "name": "이승학", "role": "일반직원", "pos": "전산팀장", "pay": "MONTHLY", "date": "2023-06-12", "wRate": 13500, "hRate": 13500, "sal": 2717000, "phone": "010-4399-4293", "user": "lee@shinsegae.com", "pass": "1234" },
  "emp_7": { "name": "김제희", "role": "일반직원", "pos": "조제보조/ATC", "pay": "MONTHLY", "date": "2024-11-01", "wRate": 13000, "hRate": 13000, "sal": 2717000, "phone": "010-7273-7155", "user": "kimjh@shinsegae.com", "pass": "1234" },
  "emp_8": { "name": "윤세라", "role": "일반직원", "pos": "매장관리/재고", "pay": "MONTHLY", "date": "2026-03-01", "wRate": 13000, "hRate": 13000, "sal": 2717000, "phone": "010-6371-4079", "user": "yoon@shinsegae.com", "pass": "1234" },
  "emp_9": { "name": "김배영", "role": "일반직원", "pos": "전산/매장보조", "pay": "MONTHLY", "date": "2025-11-18", "wRate": 13000, "hRate": 13000, "sal": 2717000, "phone": "010-2711-3257", "user": "kimbay@shinsegae.com", "pass": "1234" }
}
'@

$masterMap = $jsonText | ConvertFrom-Json
$now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$allTabs = @("notices-module", "worklog-module", "schedule-module", "annual-leave-module", "discount-purchase-module", "rules-module", "emergency-contacts-module")
$dirTabs = $allTabs + @("approval-module", "staff-directory-module", "pharmacy-settlement-module", "building-rental-module")

$res = Invoke-RestMethod -Uri 'https://shinsegaeapp.vercel.app/api/sync' -Method Get
$newEmps = @()

foreach ($prop in $masterMap.PSObject.Properties) {
    $id = $prop.Name
    $val = $prop.Value
    $tabs = if ($id -eq "emp_1") { $dirTabs } else { $allTabs }
    $newEmps += [PSCustomObject]@{
        id = $id
        username = $val.user
        email = $val.user
        passcode = $val.pass
        name = $val.name
        role = $val.role
        position = $val.pos
        payType = $val.pay
        joinDate = $val.date
        weekdayRate = $val.wRate
        holidayRate = $val.hRate
        hourlyRate = $val.wRate
        baseMonthlySalary = $val.sal
        phone = $val.phone
        usedLeave = 0
        pendingLeave = 0
        memo = "신세계약국 정식 등록 계정"
        allowedTabs = $tabs
        updatedAt = $now
    }
}

$res.data.employees = $newEmps
$res.data.pharmacistRates = [PSCustomObject]@{
    emp_2 = [PSCustomObject]@{ weekdayRate = 80000; holidayRate = 20000; breakHours = 1 }
    emp_3 = [PSCustomObject]@{ weekdayRate = 25000; holidayRate = 27000; breakHours = 1 }
    emp_4 = [PSCustomObject]@{ weekdayRate = 23000; holidayRate = 23000; breakHours = 1 }
    emp_5 = [PSCustomObject]@{ weekdayRate = 25000; holidayRate = 27000; breakHours = 1 }
}

$postJson = $res | ConvertTo-Json -Depth 10
$postBytes = [System.Text.Encoding]::UTF8.GetBytes($postJson)
$wr = [System.Net.WebRequest]::Create("https://shinsegaeapp.vercel.app/api/sync")
$wr.Method = "POST"
$wr.ContentType = "application/json; charset=utf-8"
$wr.ContentLength = $postBytes.Length
$os = $wr.GetRequestStream()
$os.Write($postBytes, 0, $postBytes.Length)
$os.Close()
$resp = $wr.GetResponse()
$sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
$result = $sr.ReadToEnd()
Write-Host "Sync Result: $result"
