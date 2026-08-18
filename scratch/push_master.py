import json
import urllib.request
import time

all_tabs = [
    "notices-module", "worklog-module", "schedule-module",
    "annual-leave-module", "discount-purchase-module", "rules-module", "emergency-contacts-module"
]
director_tabs = all_tabs + ["approval-module", "staff-directory-module", "pharmacy-settlement-module", "building-rental-module"]

now = int(time.time() * 1000)

master_employees = [
    { "id": "emp_1", "username": "director@shinsegae.com", "email": "director@shinsegae.com", "passcode": "367900", "name": "문성도", "role": "약국장", "position": "대표약사", "payType": "DIRECTOR", "joinDate": "2020-03-01", "weekdayRate": 45000, "holidayRate": 45000, "hourlyRate": 45000, "baseMonthlySalary": 0, "phone": "010-3679-0000", "usedLeave": 3, "pendingLeave": 0, "memo": "신세계약국 대표약사 최고 관리자 계정", "allowedTabs": director_tabs, "updatedAt": now },
    { "id": "emp_2", "username": "iniha@naver.com", "email": "iniha@naver.com", "passcode": "1234", "name": "권명주", "role": "근무약사", "position": "조제팀장", "payType": "HOURLY", "joinDate": "2024-09-06", "weekdayRate": 80000, "holidayRate": 20000, "hourlyRate": 80000, "baseMonthlySalary": 0, "phone": "010-2385-0402", "usedLeave": 2, "pendingLeave": 0, "memo": "조제 팀장 / 약정시급제 적용 근무약사", "allowedTabs": all_tabs, "updatedAt": now },
    { "id": "emp_3", "username": "yang@shinsegae.com", "email": "yang@shinsegae.com", "passcode": "1234", "name": "양윤지", "role": "근무약사", "position": "DUR검수약사", "payType": "HOURLY", "joinDate": "2023-10-04", "weekdayRate": 25000, "holidayRate": 27000, "hourlyRate": 25000, "baseMonthlySalary": 0, "phone": "010-4726-9807", "usedLeave": 6, "pendingLeave": 0, "memo": "처방검수및일반관리/ 약정시급제 적용 근무약사", "allowedTabs": all_tabs, "updatedAt": now },
    { "id": "emp_4", "username": "kimdw@shinsegae.com", "email": "kimdw@shinsegae.com", "passcode": "1234", "name": "김동완", "role": "근무약사", "position": "야간담당약사", "payType": "HOURLY", "joinDate": "2026-03-01", "weekdayRate": 23000, "holidayRate": 23000, "hourlyRate": 23000, "baseMonthlySalary": 0, "phone": "010-8236-9650", "usedLeave": 5, "pendingLeave": 0, "memo": "야간 및 공휴일 조제 지정 근무약사", "allowedTabs": all_tabs, "updatedAt": now },
    { "id": "emp_5", "username": "yoo@shinsegae.com", "email": "yoo@shinsegae.com", "passcode": "1234", "name": "유호종", "role": "근무약사", "position": "신약/약품관리", "payType": "HOURLY", "joinDate": "0001-01-01", "weekdayRate": 25000, "holidayRate": 27000, "hourlyRate": 25000, "baseMonthlySalary": 0, "phone": "010-4055-5860", "usedLeave": 2, "pendingLeave": 0, "memo": "신규 입고약 수량 점검 및 검수 약사", "allowedTabs": all_tabs, "updatedAt": now },
    { "id": "emp_6", "username": "lee@shinsegae.com", "email": "lee@shinsegae.com", "passcode": "1234", "name": "이승학", "role": "일반직원", "position": "전산팀장", "payType": "MONTHLY", "joinDate": "2023-06-12", "weekdayRate": 13500, "holidayRate": 13500, "hourlyRate": 13500, "baseMonthlySalary": 2717000, "phone": "010-4399-4293", "usedLeave": 0, "pendingLeave": 0, "memo": "팜IT3000 전산 장애 및 심평원 청구", "allowedTabs": all_tabs, "updatedAt": now },
    { "id": "emp_7", "username": "kimjh@shinsegae.com", "email": "kimjh@shinsegae.com", "passcode": "1234", "name": "김제희", "role": "일반직원", "position": "조제보조/ATC", "payType": "MONTHLY", "joinDate": "2024-11-01", "weekdayRate": 13000, "holidayRate": 13000, "hourlyRate": 13000, "baseMonthlySalary": 2717000, "phone": "010-7273-7155", "usedLeave": 6, "pendingLeave": 0, "memo": "ATC 자동조제기 관리 및 소모품", "allowedTabs": all_tabs, "updatedAt": now },
    { "id": "emp_8", "username": "yoon@shinsegae.com", "email": "yoon@shinsegae.com", "passcode": "1234", "name": "윤세라", "role": "일반직원", "position": "매장관리/재고", "payType": "MONTHLY", "joinDate": "2026-03-01", "weekdayRate": 13000, "holidayRate": 13000, "hourlyRate": 13000, "baseMonthlySalary": 2717000, "phone": "010-6371-4079", "usedLeave": 1, "pendingLeave": 0, "memo": "일반의약품 및 매장 재고 관리", "allowedTabs": all_tabs, "updatedAt": now },
    { "id": "emp_9", "username": "kimbay@shinsegae.com", "email": "kimbay@shinsegae.com", "passcode": "1234", "name": "김배영", "role": "일반직원", "position": "전산/매장보조", "payType": "MONTHLY", "joinDate": "2025-11-18", "weekdayRate": 13000, "holidayRate": 13000, "hourlyRate": 13000, "baseMonthlySalary": 2717000, "phone": "010-2711-3257", "usedLeave": 0, "pendingLeave": 0, "memo": "매장 안내 및 전산 서포트", "allowedTabs": all_tabs, "updatedAt": now }
]

req = urllib.request.Request('https://shinsegaeapp.vercel.app/api/sync', headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req) as resp:
    curr = json.loads(resp.read().decode('utf-8'))

curr['data']['employees'] = master_employees
curr['data']['pharmacistRates'] = {
    'emp_2': { 'weekdayRate': 80000, 'holidayRate': 20000, 'breakHours': 1.0 },
    'emp_3': { 'weekdayRate': 25000, 'holidayRate': 27000, 'breakHours': 1.0 },
    'emp_4': { 'weekdayRate': 23000, 'holidayRate': 23000, 'breakHours': 1.0 },
    'emp_5': { 'weekdayRate': 25000, 'holidayRate': 27000, 'breakHours': 1.0 }
}

post_data = json.dumps(curr, ensure_ascii=False).encode('utf-8')
post_req = urllib.request.Request('https://shinsegaeapp.vercel.app/api/sync', data=post_data, headers={'Content-Type': 'application/json;charset=utf-8', 'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(post_req) as post_resp:
    res = json.loads(post_resp.read().decode('utf-8'))
    print("Success:", res.get("success", False))
