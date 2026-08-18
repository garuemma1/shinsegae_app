/**
 * 구글 시트 데이터 연동 & 로컬 스토리 관리 모듈 (Google Sheets Data Sync)
 * 신세계약국 전용 9인 정식 명단 (약국장 1명, 근무약사 4명, 일반직원 4명)
 */
window.SheetsSync = (function () {

  const STORAGE_KEYS = {
    EMPLOYEES: 'ssg_employees_v1',
    SCHEDULE: 'ssg_schedule_v1',
    SCHEDULE_STATUS: 'ssg_schedule_status_v1',
    NOTICES: 'ssg_notices_v1',
    LEAVE_REQUESTS: 'ssg_leave_requests_v1',
    DISCOUNT_PURCHASES: 'ssg_discount_purchases_v1',
    WORKLOGS: 'ssg_worklogs_v1',
    EMERGENCY_CONTACTS: 'ssg_emergency_contacts_v1',
    PHARMACY_SETTLEMENT: 'ssg_pharmacy_settlement_v1',
    BUILDING_RENTAL: 'ssg_building_rental_v1',
    PAYSTUBS: 'ssg_paystubs_v1',
    OVERTIME_ADJUSTMENTS: 'ssg_overtime_adjustments_v1',
    CURRENT_USER: 'ssg_current_user_v1',
    SHEET_URL: 'ssg_sheet_url',
    LAST_SYNC: 'ssg_last_sync',
    EMP_PERMISSIONS: 'ssg_emp_permissions_v1'  // 직원별 탭 권한 별도 저장소
  };

  const DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/16yVS9f9bQs9Z2S1k2McnxhHGb9QjQguPa93MxZvNtP0/edit?gid=0#gid=0";

  // 기본 허용 탭 목록 (전 직원 공용)
  const ALL_COMMON_TABS = [
    'notices-module',
    'worklog-module',
    'schedule-module',
    'annual-leave-module',
    'discount-purchase-module',
    'rules-module',
    'emergency-contacts-module'
  ];

  // 신세계약국 영구 마스터 디폴트 9인 정식 명단 및 디폴트 정보 (약국장 1명, 근무약사 4명, 일반직원 4명)
  const INITIAL_EMPLOYEES = [
    { id: 'emp_1', username: 'director@shinsegae.com', email: 'director@shinsegae.com', passcode: '367900', name: '문성도', role: '약국장', position: '대표약사', payType: 'DIRECTOR', joinDate: '2020-03-01', weekdayRate: 45000, holidayRate: 45000, hourlyRate: 45000, baseMonthlySalary: 0, phone: '010-3679-0000', usedLeave: 3, pendingLeave: 0, memo: '신세계약국 대표약사 최고 관리자 계정', allowedTabs: [...ALL_COMMON_TABS, 'approval-module', 'staff-directory-module', 'pharmacy-settlement-module', 'building-rental-module'], updatedAt: 1787026500000 },
    { id: 'emp_2', username: 'iniha@naver.com', email: 'iniha@naver.com', passcode: '0402', name: '권명주', role: '근무약사', position: '조제팀장', payType: 'HOURLY', joinDate: '2024-09-06', weekdayRate: 80000, holidayRate: 20000, hourlyRate: 80000, baseMonthlySalary: 0, phone: '010-2385-0402', usedLeave: 2, pendingLeave: 0, memo: '조제 팀장 / 약정시급제 적용 근무약사', allowedTabs: [...ALL_COMMON_TABS], updatedAt: 1787026500000 },
    { id: 'emp_3', username: 'yang@shinsegae.com', email: 'yang@shinsegae.com', passcode: '9807', name: '양윤지', role: '근무약사', position: 'DUR검수약사', payType: 'HOURLY', joinDate: '2023-10-04', weekdayRate: 25000, holidayRate: 27000, hourlyRate: 25000, baseMonthlySalary: 0, phone: '010-4726-9807', usedLeave: 6, pendingLeave: 0, memo: '처방검수및일반관리/ 약정시급제 적용 근무약사', allowedTabs: [...ALL_COMMON_TABS], updatedAt: 1787026500000 },
    { id: 'emp_4', username: 'kimdw@shinsegae.com', email: 'kimdw@shinsegae.com', passcode: '9650', name: '김동완', role: '근무약사', position: '야간담당약사', payType: 'HOURLY', joinDate: '2026-03-01', weekdayRate: 23000, holidayRate: 23000, hourlyRate: 23000, baseMonthlySalary: 0, phone: '010-8236-9650', usedLeave: 5, pendingLeave: 0, memo: '야간 및 공휴일 조제 지정 근무약사', allowedTabs: [...ALL_COMMON_TABS], updatedAt: 1787026500000 },
    { id: 'emp_5', username: 'yoo@shinsegae.com', email: 'yoo@shinsegae.com', passcode: '5860', name: '유호종', role: '근무약사', position: '신약/약품관리', payType: 'HOURLY', joinDate: '0001-01-01', weekdayRate: 25000, holidayRate: 27000, hourlyRate: 25000, baseMonthlySalary: 0, phone: '010-4055-5860', usedLeave: 2, pendingLeave: 0, memo: '신규 입고약 수량 점검 및 검수 약사', allowedTabs: [...ALL_COMMON_TABS], updatedAt: 1787026500000 },
    { id: 'emp_6', username: 'lee@shinsegae.com', email: 'lee@shinsegae.com', passcode: '4293', name: '이승학', role: '일반직원', position: '전산팀장', payType: 'MONTHLY', joinDate: '2023-06-12', weekdayRate: 13500, holidayRate: 13500, hourlyRate: 13500, baseMonthlySalary: 2717000, phone: '010-4399-4293', usedLeave: 0, pendingLeave: 0, memo: '팜IT3000 전산 장애 및 심평원 청구', allowedTabs: [...ALL_COMMON_TABS], updatedAt: 1787026500000 },
    { id: 'emp_7', username: 'kimjh@shinsegae.com', email: 'kimjh@shinsegae.com', passcode: '7155', name: '김제희', role: '일반직원', position: '조제보조/ATC', payType: 'MONTHLY', joinDate: '2024-11-01', weekdayRate: 13000, holidayRate: 13000, hourlyRate: 13000, baseMonthlySalary: 2717000, phone: '010-7273-7155', usedLeave: 6, pendingLeave: 0, memo: 'ATC 자동조제기 관리 및 소모품', allowedTabs: [...ALL_COMMON_TABS], updatedAt: 1787026500000 },
    { id: 'emp_8', username: 'yoon@shinsegae.com', email: 'yoon@shinsegae.com', passcode: '4079', name: '윤세라', role: '일반직원', position: '매장관리/재고', payType: 'MONTHLY', joinDate: '2026-03-01', weekdayRate: 13000, holidayRate: 13000, hourlyRate: 13000, baseMonthlySalary: 2717000, phone: '010-6371-4079', usedLeave: 1, pendingLeave: 0, memo: '일반의약품 및 매장 재고 관리', allowedTabs: [...ALL_COMMON_TABS], updatedAt: 1787026500000 },
    { id: 'emp_9', username: 'kimbay@shinsegae.com', email: 'kimbay@shinsegae.com', passcode: '3257', name: '김배영', role: '일반직원', position: '전산/매장보조', payType: 'MONTHLY', joinDate: '2025-11-18', weekdayRate: 13000, holidayRate: 13000, hourlyRate: 13000, baseMonthlySalary: 2717000, phone: '010-2711-3257', usedLeave: 0, pendingLeave: 0, memo: '매장 안내 및 전산 서포트', allowedTabs: [...ALL_COMMON_TABS], updatedAt: 1787026500000 }
  ];

  const INITIAL_DISCOUNT_PURCHASES = [
    { id: 'disc_1', empId: 'emp_8', empName: '윤세라', dateStr: '2026. 08. 10. 14:20', itemName: '유로펜정', unitPrice: 1980, qty: 2, totalPrice: 4400 },
    { id: 'disc_2', empId: 'emp_6', empName: '이승학', dateStr: '2026. 08. 09. 17:57', itemName: '일동하이퍼비타민씨', unitPrice: 26000, qty: 1, totalPrice: 28600 },
    { id: 'disc_3', empId: 'emp_9', empName: '김배영', dateStr: '2026. 08. 07. 10:31', itemName: '산리오큐빅피규어스탬프', unitPrice: 4200, qty: 2, totalPrice: 9300 },
    { id: 'disc_4', empId: 'emp_7', empName: '김제희', dateStr: '2026. 08. 06. 18:09', itemName: '파인싹연질캡슐', unitPrice: 880, qty: 1, totalPrice: 1000 },
    { id: 'disc_5', empId: 'emp_3', empName: '양윤지', dateStr: '2026. 08. 06. 09:43', itemName: '탁센레이디(10cap) 외 1건', unitPrice: 7705, qty: 1, totalPrice: 8500 },
    { id: 'disc_6', empId: 'emp_2', empName: '권명주', dateStr: '2026. 08. 05. 17:47', itemName: '핑크퐁 퍼즐미로', unitPrice: 3300, qty: 1, totalPrice: 3700 },
    { id: 'disc_7', empId: 'emp_5', empName: '유호종', dateStr: '2026. 08. 05. 10:15', itemName: '한미썬크림', unitPrice: 9900, qty: 1, totalPrice: 10900 }
  ];

  const INITIAL_SCHEDULE = [];

  const INITIAL_NOTICES = [
    { id: 'n1', title: '📢 [중요] 2026년 8월 광복절 및 대체공휴일 교대근무 및 휴일수당 안내', content: '8월 15일(광복절) 및 8월 17일(대체공휴일) 근무는 근로기준법에 따라 휴일근로가산수당(1.5배)이 자동 적용됩니다.', date: '2026-08-01', author: '문성도 약국장', category: '긴급/근무', isPinned: true },
    { id: 'n2', title: '💊 [SOP] 야간 및 주말 복약지도 및 처방전 조제 보조 지침', content: '야간(18시 이후) 및 주말 처방전 입력 시 이중점검(DUR 확인) 후 투약 봉투 출력 절차를 준수해 주세요.', date: '2026-08-03', author: '권명주 근무약사', category: '조제/투약', isPinned: true },
    { id: 'n3', title: '🌴 [연차] 8월 여름 휴가 및 연차 신청서 사전 제출 요청', content: '여름 휴가 기간 연차 사용 시 취업규칙 제13조에 따라 최소 14일 전 신청서를 제출하여 약국장 결재를 받으시기 바랍니다.', date: '2026-08-05', author: '문성도 약국장', category: '인사/연차', isPinned: false }
  ];

  const INITIAL_LEAVE_REQUESTS = [
    { id: 'l1', empId: 'emp_7', empName: '김제희', role: '일반직원', startDate: '2026-08-14', endDate: '2026-08-14', daysCount: 1.0, type: '연차', reason: '여름 개인 휴가', status: 'PENDING', createdAt: '2026-08-05 10:30' },
    { id: 'l2', empId: 'emp_2', empName: '권명주', role: '근무약사', startDate: '2026-08-21', endDate: '2026-08-21', daysCount: 1.0, type: '연차', reason: '학회 참석 및 정기휴가', status: 'APPROVED', createdAt: '2026-08-01 14:00' }
  ];

  // 신규: 약국 업무일지 & 교대 인수인계 초기 데이터 (실시간 연동 기본값)
  const INITIAL_WORKLOGS = [
    { id: 'task_1', date: '2026-08-18', tag: '품절', content: '타이레놀', authorName: '이승학', status: 'PENDING', createdAt: '2026-08-18 10:30', checkedBy: [] },
    { id: 'task_2', date: '2026-08-18', tag: '주문', content: '뭐 없어요', authorName: '양윤지', status: 'PENDING', createdAt: '2026-08-18 09:15', checkedBy: [] },
    { id: 'task_3', date: '2026-08-18', tag: '일반/메모', content: '안녕하세여', authorName: '권명주', status: 'PENDING', createdAt: '2026-08-18 08:50', checkedBy: [] },
    { id: 'task_4', date: '2026-08-17', tag: '입고/처리', content: '둘코락스 찌그러진거 회메에서 입고된거 판매가 됐을까요???', authorName: '권명주', status: 'PENDING', createdAt: '2026-08-17 18:20', checkedBy: [] },
    { id: 'task_5', date: '2026-08-17', tag: '주문', content: '케어가글왔습니디 주문요청', authorName: '이승학', status: 'PENDING', createdAt: '2026-08-17 16:40', checkedBy: [] },
    { id: 'task_6', date: '2026-08-17', tag: '주문', content: '넥스가드 전화요청', authorName: '김제희', status: 'PENDING', createdAt: '2026-08-17 14:10', checkedBy: [] },
    { id: 'task_7', date: '2026-08-17', tag: '일반/메모', content: '먹는약 내일 오기로', authorName: '문성도', status: 'PENDING', createdAt: '2026-08-17 11:30', checkedBy: ['문성도 약국장'] },
    { id: 'task_8', date: '2026-08-16', tag: '품절', content: '듀라티얼즈 안연고', authorName: '문성도', status: 'PENDING', createdAt: '2026-08-16 17:00', checkedBy: ['문성도 약국장'] }
  ];

  // 신규: 약국 운영 지원 연락망 초기 데이터 (4대 카테고리)
  const INITIAL_EMERGENCY_CONTACTS = {
    staff: [
      { name: '문성도', role: '약국장', dept: '대표약사 / 총괄', phone: '010-3679-0000', emergencyPhone: '010-3679-0000', notes: '24시간 약국 긴급 비상 연락 1순위' },
      { name: '권명주', role: '근무약사', dept: '조제 팀장', phone: '010-1234-5678', emergencyPhone: '010-1234-5678', notes: '조제실 긴급 인수인계 및 주말 전담' },
      { name: '양윤지', role: '근무약사', dept: 'DUR 검수약사', phone: '010-2345-6789', emergencyPhone: '010-2345-6789', notes: '처방전 시스템 및 학회 문의' },
      { name: '김동완', role: '근무약사', dept: '야간 담당 약사', phone: '010-3456-7890', emergencyPhone: '010-3456-7890', notes: '야간 및 공휴일 조제 지정 근무자' },
      { name: '유호종', role: '근무약사', dept: '신약/약품관리', phone: '010-4567-8901', emergencyPhone: '010-4567-8901', notes: '신규 입고약 수량 점검 및 검수' },
      { name: '이승학', role: '일반직원', dept: '전산 팀장', phone: '010-5678-9012', emergencyPhone: '010-5678-9012', notes: '팜IT3000 전산 장애 및 심평원 청구' },
      { name: '김제희', role: '일반직원', dept: '조제보조 / ATC', phone: '010-6789-0123', emergencyPhone: '010-6789-0123', notes: 'ATC 자동조제기 A/S 및 소모품' },
      { name: '윤세라', role: '일반직원', dept: '매장관리 / 재고', phone: '010-7890-1234', emergencyPhone: '010-7890-1234', notes: '일반의약품 및 매장 재고 관리' },
      { name: '김배영', role: '일반직원', dept: '전산 / 매장보조', phone: '010-8901-2345', emergencyPhone: '010-8901-2345', notes: '매장 안내 및 전산 서포트' }
    ],
    wholesalers: [
      { name: '지오영 (주요 도매)', repName: '김지오 팀장', phone: '010-9988-1122', cutoff: '오후 5:30 마감 (익일 오전 배송)', items: '전문의약품, 일반의약품 전 품목', type: '도매상' },
      { name: '백제약품', repName: '박백제 차장', phone: '010-8877-2233', cutoff: '오후 6:00 마감 (당일 야간/익일 첫차)', items: '긴급 전문약, 주사제, 소모품', type: '도매상' },
      { name: '동원약품', repName: '최동원 과장', phone: '010-7766-3344', cutoff: '오후 5:00 마감', items: '일반의약품, 건강기능식품', type: '도매상' },
      { name: '유진약품', repName: '정유진 대리', phone: '010-6655-4455', cutoff: '오후 4:30 마감', items: '한방 의약품, 의약외품', type: '도매상' },
      { name: '한미약품 직거래', repName: '이한미 팀장', phone: '010-1111-2222', cutoff: '오후 4:00 마감', items: '한미 전문약 (아모디핀/로수젯 등)', type: '제약사 직거래' },
      { name: '유한양행 직거래', repName: '박유한 차장', phone: '010-3333-4444', cutoff: '오후 4:00 마감', items: '유한 전문약/일반약 (삐꼼씨/트윈스타)', type: '제약사 직거래' },
      { name: '대웅제약 직거래', repName: '정대웅 과장', phone: '010-5555-6666', cutoff: '오후 4:30 마감', items: '대웅 전문약/일반약 (우루사/올메텍)', type: '제약사 직거래' }
    ],
    equipment: [
      { category: 'ATC / 포장기', name: 'JVM ATC 자동조제기 A/S센터', phone: '1577-1234', notes: '카세트 정밀 교체, 전산 연동 및 롤포지 보충 A/S' },
      { category: '약국 전산', name: '팜IT3000 유지보수센터', phone: '1588-0000', notes: '평일 09:00~20:00 / 토 09:00~15:00 (심평원 청구 및 장애)' },
      { category: '카드 단말기', name: 'NICE 정보통신 POS A/S', phone: '1544-4567', notes: 'POS 카드가맹점 결제 장애 24h 긴급 출동 지원' },
      { category: 'PC / 프린터(잉크)', name: '메가 오피스 전산 & 토너/잉크 A/S', phone: '02-555-1234', notes: '처방전 봉투 프린터, 잉크 카트리지 및 PC 긴급 수리' }
    ],
    facilities: [
      { category: '조은봉투 (소모품)', name: '조은봉투 (약봉투/약포지 주문)', phone: '1544-0000', notes: '약국 조제 봉투, 복약지도지, 롤포지 자동 인쇄 소모품' },
      { category: '건물 관리사무소', name: '신세계약국 타워 관리사무소', phone: '032-888-0000', notes: '주차장 안내, 엘리베이터, 누수/전기/냉난방 관리' },
      { category: '보안 및 방제', name: 'ADT 캡스 무인경비 & 세스코 방제', phone: '1588-6400', notes: '24시간 무인 출입 보안 및 세스코 위생/방제 관리' },
      { category: '의료폐기물 / 관공서', name: '관할 보건소 의약과 & 폐기물', phone: '031-123-4567', notes: '마약류 보고, 의약품 수불 및 의료폐기물 수거' }
    ]
  };

 // 신규: 약국 정산 시스템 초기 데이터 (Director Only) - 10년 노하우 양식 반영
  function generateInitialDailyLogs() {
    const logs = [];
    for (let d = 1; d <= 31; d++) {
      const dateStr = `2026-08-${String(d).padStart(2, '0')}`;
      const dayIdx = new Date(dateStr).getDay();
      const isSun = dayIdx === 0;
      const isSat = dayIdx === 6;
      
      // 가상의 매출 데이터 생성
      const disp = isSun ? 350000 : (isSat ? 1100000 : 1650000 + (d * 12000) % 250000);
      const pos = isSun ? 280000 : (isSat ? 750000 : 820000 + (d * 8000) % 180000);
      const cardPay = Math.round((disp + pos) * (isSun ? 0.9 : 0.85));
      const cashPay = (disp + pos) - cardPay;
      
      logs.push({
        id: 'stl_' + dateStr.replace(/-/g, ''),
        date: dateStr,
        manager: isSun ? '문성도' : '김제희',
        expFood: isSun ? 0 : (d % 3 === 0 ? 25000 : 12000), // 식대
        expDrink: d % 5 === 0 ? 11000 : 0,                   // 박카스
        expBag: d % 7 === 0 ? 15000 : 0,                     // 봉투/종량제
        expEtc: 0,                                           // 기타잡비
        incCarryover: 790000,                                // 이월시재
        incCash: cashPay,                                    // 현금 잔고
        incCard: cardPay                                     // 카드 결제액
      });
    }
    return logs;
  }

  const INITIAL_PHARMACY_SETTLEMENT = {
    month: '2026-08',
    dispensingFee: 18500000,     // 조제료 수입
    posRevenue: 24200000,        // 매장 POS 일반매출
    patientCopay: 12000000,      // 본인부담금
    nhisClaim: 18000000,         // 공단청구금
    otherIncome: 1800000,        // 비급여/기타수입
    
    // 약품 사입비 결제 (도매상 현금/통장 + 제약사 카드)
    cashWholesale: {
      '다우약품': 12400000,
      '산성호': 8500000,
      '백제약품': 7200000,
      '지오영': 6800000
    },
    cardPharma: {
      '대웅제약': 2400000,
      '동화약품': 1800000,
      '일양약품': 1200000,
      '비타민하우스': 950000,
      'GC녹십자': 1050000
    },
    
    // 공과금 및 고정비
    rentExpense: 3500000,
    maintExpense: 500000,
    insurance4Cost: 1850000,
    taxAccountantFee: 220000,
    posCardFee: 1120000,
    
    // 금융비용
    loanInterest: 2150000,
    loanPrincipal: 1500000,

    // 일일 결산 장부
    dailyLogs: generateInitialDailyLogs(),

    // 연도별 장기 성장 통계 (2021~2026)
    yearlyStats: [
      { year: 2021, revenue: 420000000, drugCost: 260000000, payroll: 72000000, operating: 38000000, profit: 50000000, margin: 11.9 },
      { year: 2022, revenue: 490000000, drugCost: 300000000, payroll: 84000000, operating: 42000000, profit: 64000000, margin: 13.0 },
      { year: 2023, revenue: 580000000, drugCost: 350000000, payroll: 98000000, operating: 48000000, profit: 84000000, margin: 14.4 },
      { year: 2024, revenue: 670000000, drugCost: 400000000, payroll: 115000000, operating: 54000000, profit: 101000000, margin: 15.0 },
      { year: 2025, revenue: 760000000, drugCost: 450000000, payroll: 132000000, operating: 60000000, profit: 118000000, margin: 15.5 },
      { year: 2026, revenue: 880000000, drugCost: 510000000, payroll: 154000000, operating: 68000000, profit: 148000000, margin: 16.8 }
    ]
  };

  // 신규: 메가스타 건물 임대업 대시보드 초기 데이터 (Director Only - 실전 9개 사업장 기본 탑재)
  const INITIAL_BUILDING_RENTAL = {
    buildingName: '신세계약국 부동산 포트폴리오',
    assetValue: 12500000000, // 보유 건물 자산 총가치 125억 원
    units: [
      {
        id: 'prop_1',
        buildingName: '보광프라자 (107호/108호)',
        unit: '107호, 108호',
        ownershipType: 'SOLE',
        mySharePercent: 100,
        ownerLabel: '문성도 (단독 100%)',
        tenantName: '신세계약국 (자사)',
        repName: '문성도',
        bizNo: '120-88-12345',
        location: '경기도 고양시 덕양구 화정동 107호',
        type: '소매/약국',
        deposit: 100000000,
        rent: 3500000,
        vatType: 'EXCLUSIVE',
        vat: 350000,
        mortgageInterest: 1200000,
        maintenanceFee: 500000,
        startDate: '2020-03-01',
        endDate: '2030-03-01',
        status: 'PAID',
        unpaidDays: 0,
        taxInvoice: true,
        note: '신세계약국 직접 운영 (처방/조제 마스터 점포)'
      },
      {
        id: 'prop_2',
        buildingName: '보광프라자 (109~110호)',
        unit: '109호, 110호',
        ownershipType: 'SOLE',
        mySharePercent: 100,
        ownerLabel: '문성도 (단독 100%)',
        tenantName: '메디컬 의원 연계',
        repName: '김원장',
        bizNo: '211-81-54321',
        location: '경기도 고양시 덕양구 화정동 109호',
        type: '병원/의원',
        deposit: 80000000,
        rent: 2800000,
        vatType: 'EXCLUSIVE',
        vat: 280000,
        mortgageInterest: 950000,
        maintenanceFee: 400000,
        startDate: '2022-06-01',
        endDate: '2027-05-31',
        status: 'PAID',
        unpaidDays: 0,
        taxInvoice: true,
        note: '처방전 주요 연계 병원 입점'
      },
      {
        id: 'prop_3',
        buildingName: '엠씨(MC) 범계 (점포1호)',
        unit: '범계 점포 1호',
        ownershipType: 'JOINT2',
        mySharePercent: 50,
        ownerLabel: '문성도 외 1명 (50%)',
        tenantName: '범계 프랜차이즈 식당',
        repName: '이동업',
        bizNo: '135-86-98765',
        location: '경기도 안양시 동안구 범계동 상가1',
        type: '음식점/프랜차이즈',
        deposit: 50000000,
        rent: 2200000,
        vatType: 'EXCLUSIVE',
        vat: 220000,
        mortgageInterest: 700000,
        maintenanceFee: 300000,
        startDate: '2023-11-01',
        endDate: '2026-10-31',
        status: 'PAID',
        unpaidDays: 0,
        taxInvoice: true,
        note: '만료 예정 D-77 (계약 갱신 상담 예정)'
      },
      {
        id: 'prop_4',
        buildingName: '엠씨(MC) 범계 (점포2호)',
        unit: '범계 점포 2호',
        ownershipType: 'JOINT2',
        mySharePercent: 50,
        ownerLabel: '문성도 외 1명 (50%)',
        tenantName: '범계 뷰티/헤어숍',
        repName: '박헤어',
        bizNo: '135-86-98766',
        location: '경기도 안양시 동안구 범계동 상가2',
        type: '서비스/미용',
        deposit: 50000000,
        rent: 2000000,
        vatType: 'EXCLUSIVE',
        vat: 200000,
        mortgageInterest: 650000,
        maintenanceFee: 280000,
        startDate: '2024-03-01',
        endDate: '2027-02-28',
        status: 'PAID',
        unpaidDays: 0,
        taxInvoice: true,
        note: '자동 연장계약 유지 중'
      },
      {
        id: 'prop_5',
        buildingName: '엠씨(MC) 오산 (101/102/201호)',
        unit: '101, 102, 201호',
        ownershipType: 'JOINT4',
        mySharePercent: 25,
        ownerLabel: '문성도 외 3명 (25%)',
        tenantName: '오산 메디컬 타워',
        repName: '오산원장',
        bizNo: '124-81-33445',
        location: '경기도 오산시 오산동 메디컬',
        type: '병원/의원',
        deposit: 150000000,
        rent: 4800000,
        vatType: 'EXCLUSIVE',
        vat: 480000,
        mortgageInterest: 1600000,
        maintenanceFee: 650000,
        startDate: '2023-07-01',
        endDate: '2028-06-30',
        status: 'PAID',
        unpaidDays: 0,
        taxInvoice: true,
        note: '4인 공동투자 메디컬 상가'
      },
      {
        id: 'prop_6',
        buildingName: '회천메디칼 (201호)',
        unit: '201호',
        ownershipType: 'SOLE',
        mySharePercent: 100,
        ownerLabel: '문성도 (단독 100%)',
        tenantName: '회천 이비인후과의원',
        repName: '최의사',
        bizNo: '127-82-44556',
        location: '경기도 양주시 회천동 201호',
        type: '병원/의원',
        deposit: 60000000,
        rent: 2500000,
        vatType: 'EXCLUSIVE',
        vat: 250000,
        mortgageInterest: 800000,
        maintenanceFee: 350000,
        startDate: '2023-10-01',
        endDate: '2026-09-30',
        status: 'UNPAID',
        unpaidDays: 5,
        taxInvoice: true,
        note: '계약 만료 D-46 (당월 월세 입금 대기)'
      },
      {
        id: 'prop_7',
        buildingName: '다산메디칼 (302호)',
        unit: '302호',
        ownershipType: 'JOINT2',
        mySharePercent: 50,
        ownerLabel: '문성도 외 1명 (50%)',
        tenantName: '다산 내과전문병원',
        repName: '정내과',
        bizNo: '138-81-66778',
        location: '경기도 남양주시 다산동 302호',
        type: '병원/의원',
        deposit: 100000000,
        rent: 3200000,
        vatType: 'EXCLUSIVE',
        vat: 320000,
        mortgageInterest: 1100000,
        maintenanceFee: 450000,
        startDate: '2024-12-01',
        endDate: '2029-11-30',
        status: 'PAID',
        unpaidDays: 0,
        taxInvoice: true,
        note: '2인 공동투자 장기계약 완료'
      },
      {
        id: 'prop_8',
        buildingName: '옥정메디컬프라자2 (MK2)',
        unit: '301호',
        ownershipType: 'JOINT2',
        mySharePercent: 50,
        ownerLabel: '문성도 외 1명 (50%)',
        tenantName: '옥정 치과의원',
        repName: '강치과',
        bizNo: '139-82-77889',
        location: '경기도 양주시 옥정동 MK2 301호',
        type: '병원/치과',
        deposit: 80000000,
        rent: 2700000,
        vatType: 'EXCLUSIVE',
        vat: 270000,
        mortgageInterest: 900000,
        maintenanceFee: 400000,
        startDate: '2023-11-15',
        endDate: '2026-11-15',
        status: 'PAID',
        unpaidDays: 0,
        taxInvoice: true,
        note: '만료 예정 D-92 (임대료 5% 인상 상담 진행)'
      },
      {
        id: 'prop_9',
        buildingName: '신세계약국 오창주택 (그림같은집)',
        unit: '다가구 10개호수 (통임대)',
        ownershipType: 'SOLE',
        mySharePercent: 100,
        ownerLabel: '문성도 (단독 100%)',
        tenantName: '오창 다가구주택 (10가구)',
        repName: '문성도',
        bizNo: '301-81-11223',
        location: '충북 청주시 청원구 오창읍 주택 단지',
        type: '주거/다가구(면세)',
        deposit: 200000000,
        rent: 6500000,
        vatType: 'TAX_EXEMPT',
        vat: 0,
        mortgageInterest: 2100000,
        maintenanceFee: 500000,
        startDate: '2021-01-01',
        endDate: '2031-12-31',
        status: 'PAID',
        unpaidDays: 0,
        taxInvoice: false,
        note: '다가구 주택 10개호수 통임대 운영 (주거용 면세)'
      }
    ]
  };

  function generateScheduleForMonth(year, month) {
    const list = [];
    const empIds = ['emp_1', 'emp_2', 'emp_3', 'emp_4', 'emp_5', 'emp_6', 'emp_7', 'emp_8', 'emp_9'];
    const totalDays = new Date(year, month, 0).getDate();
    const monthStr = String(month).padStart(2, '0');

    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${year}-${monthStr}-${String(day).padStart(2, '0')}`;

      empIds.forEach(empId => {
        // 최초 기본값: 0시간 / OFF (하단 '+ 근무/휴무 설정'을 통해 설정 시 자동 합산)
        list.push({
          id: `sch_${dateStr}_${empId}`,
          empId,
          date: dateStr,
          shift: 'OFF',
          startTime: '',
          endTime: ''
        });
      });
    }
    return list;
  }

  function generateInitialAllSchedules() {
    return [
      ...generateScheduleForMonth(2026, 6),
      ...generateScheduleForMonth(2026, 7),
      ...generateScheduleForMonth(2026, 8),
      ...generateScheduleForMonth(2026, 9)
    ];
  }

  function safeGetItem(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn("Storage warning:", e);
      return null;
    }
  }

  function safeSetItem(key, val) {
    try {
      localStorage.setItem(key, val);
    } catch (e) {
      console.warn("Storage save warning:", e);
    }
  }

  function getCurrentUser() {
    const isLoggedOut = safeGetItem('ssg_is_logged_out');
    if (isLoggedOut === 'true') {
      return null;
    }

    const raw = safeGetItem(STORAGE_KEYS.CURRENT_USER);
    if (raw) {
      try {
        const u = JSON.parse(raw);
        if (u && u.id && u.name) return u;
      } catch (e) {}
    }
    return null;
  }

  function setCurrentUser(emp) {
    safeSetItem('ssg_is_logged_out', 'false');
    safeSetItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(emp));
  }

  function logoutUser() {
    safeSetItem('ssg_is_logged_out', 'true');
    try { localStorage.removeItem(STORAGE_KEYS.CURRENT_USER); } catch(e) {}
  }

  // 비밀번호 10자리 복합 규칙 검증 (숫자4+영문4+특수기호2)
  function validatePasswordComplexity(pw) {
    if (!pw || pw.length < 10) {
      return { valid: false, message: '비밀번호는 최소 10자리 이상이어야 합니다.' };
    }
    const digits = (pw.match(/[0-9]/g) || []).length;
    if (digits < 4) {
      return { valid: false, message: '숫자가 최소 4개 이상 포함되어야 합니다. (현재 ' + digits + '개)' };
    }
    const letters = (pw.match(/[a-zA-Z]/g) || []).length;
    if (letters < 4) {
      return { valid: false, message: '영문자가 최소 4개 이상 포함되어야 합니다. (현재 ' + letters + '개)' };
    }
    const symbols = (pw.match(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g) || []).length;
    if (symbols < 2) {
      return { valid: false, message: '특수기호가 최소 2개 이상 포함되어야 합니다. (현재 ' + symbols + '개)' };
    }
    return { valid: true, message: '안전한 10자리 복합 비밀번호입니다!' };
  }

  function changePassword(empId, currentPw, newPw) {
    const emps = getEmployees();
    const target = emps.find(e => e.id === empId);
    if (!target) return { success: false, message: '해당 직원을 찾을 수 없습니다.' };

    if (target.passcode !== currentPw) {
      return { success: false, message: '현재 비밀번호가 일치하지 않습니다.' };
    }

    const check = validatePasswordComplexity(newPw);
    if (!check.valid) {
      return { success: false, message: check.message };
    }

    target.passcode = newPw;
    saveEmployees(emps);
    
    // 현재 세션 갱신
    const curr = getCurrentUser();
    if (curr && curr.id === empId) {
      curr.passcode = newPw;
      setCurrentUser(curr);
    }

    return { success: true, message: '비밀번호가 성공적으로 변경되었습니다!' };
  }

  function resetPassword(empId, customPasscode = '1234') {
    const emps = getEmployees();
    const target = emps.find(e => e.id === empId);
    if (!target) return false;
    target.passcode = String(customPasscode).trim() || '1234';
    target.updatedAt = Date.now();
    saveEmployees(emps);
    
    // 현재 세션 갱신
    const curr = getCurrentUser();
    if (curr && curr.id === empId) {
      curr.passcode = target.passcode;
      setCurrentUser(curr);
    }
    return true;
  }

  function updateStaffPermissions(empId, allowedTabs) {
    // 1. 별도 권한 저장소에 먼저 즉시 영구 저장
    try {
      let permMap = {};
      const permRaw = safeGetItem(STORAGE_KEYS.EMP_PERMISSIONS);
      if (permRaw) permMap = JSON.parse(permRaw);
      permMap[empId] = allowedTabs;
      safeSetItem(STORAGE_KEYS.EMP_PERMISSIONS, JSON.stringify(permMap));
    } catch(e) {}

    // 2. 직원 객체 업데이트 & 타임스탬프 갱신 후 클라우드 푸시
    const emps = getEmployees();
    const target = emps.find(e => e.id === empId);
    if (target) {
      target.allowedTabs = allowedTabs;
      target.updatedAt = Date.now();
      saveEmployees(emps);
    }

    // 3. 현재 세션 유저 업데이트
    const curr = getCurrentUser();
    if (curr && curr.id === empId) {
      curr.allowedTabs = allowedTabs;
      setCurrentUser(curr);
    }
    return true;
  }

  // --- 저장소 Getter & Setter 유틸리티 ---
  function getEmployees() {
    // 권한 데이터 로드 (별도 키에 저장된 것 우선)
    let permMap = {};
    try {
      const permRaw = safeGetItem(STORAGE_KEYS.EMP_PERMISSIONS);
      if (permRaw) permMap = JSON.parse(permRaw);
    } catch(e) {}

    // 직원 기본 데이터 로드
    let emps;
    try {
      const raw = safeGetItem(STORAGE_KEYS.EMPLOYEES);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          emps = parsed;
        }
      }
    } catch(e) {}

    if (!emps) {
      // 저장된 값이 없을 때만 초기값 저장
      emps = INITIAL_EMPLOYEES.map(e => ({ ...e }));
      safeSetItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(emps));
    } else {
      // 9인 마스터 기본 비밀번호 및 전화번호 뒷자리 안전 매핑
      let updatedPass = false;
      emps = emps.map(e => {
        const initMatch = INITIAL_EMPLOYEES.find(init => init.id === e.id || init.name === e.name);
        if (initMatch && (!e.passcode || e.passcode === '1234')) {
          e.passcode = initMatch.passcode;
          updatedPass = true;
        }
        return e;
      });
      if (updatedPass) {
        safeSetItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(emps));
      }
    }

    // 별도 저장된 권한을 병합 (클라우드 덧써쓰더라도 유지)
    if (Object.keys(permMap).length > 0) {
      emps = emps.map(e => {
        if (permMap[e.id]) {
          return { ...e, allowedTabs: permMap[e.id] };
        }
        return e;
      });
    }

    return emps;
  }

  function saveEmployees(data) {
    const now = Date.now();
    const list = (data || []).map(e => ({
      ...e,
      updatedAt: e.updatedAt || now
    }));
    safeSetItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(list));
    pushToCloud();
  }

  function getWorklogs() {
    try {
      const raw = safeGetItem(STORAGE_KEYS.WORKLOGS);
      return raw ? JSON.parse(raw) : INITIAL_WORKLOGS;
    } catch(e) { return INITIAL_WORKLOGS; }
  }

  function saveWorklogs(data) {
    safeSetItem(STORAGE_KEYS.WORKLOGS, JSON.stringify(data));
    pushToCloud();
  }

  function getEmergencyContacts() {
    try {
      const raw = safeGetItem(STORAGE_KEYS.EMERGENCY_CONTACTS);
      return raw ? JSON.parse(raw) : INITIAL_EMERGENCY_CONTACTS;
    } catch(e) { return INITIAL_EMERGENCY_CONTACTS; }
  }

  function saveEmergencyContacts(data) {
    safeSetItem(STORAGE_KEYS.EMERGENCY_CONTACTS, JSON.stringify(data));
    pushToCloud();
  }

  function getPharmacySettlement() {
    try {
      const raw = safeGetItem(STORAGE_KEYS.PHARMACY_SETTLEMENT);
      return raw ? JSON.parse(raw) : INITIAL_PHARMACY_SETTLEMENT;
    } catch(e) { return INITIAL_PHARMACY_SETTLEMENT; }
  }

  function savePharmacySettlement(data) {
    safeSetItem(STORAGE_KEYS.PHARMACY_SETTLEMENT, JSON.stringify(data));
    pushToCloud();
  }

  function getBuildingRental() {
    try {
      const raw = safeGetItem(STORAGE_KEYS.BUILDING_RENTAL);
      return raw ? JSON.parse(raw) : INITIAL_BUILDING_RENTAL;
    } catch(e) { return INITIAL_BUILDING_RENTAL; }
  }

  function saveBuildingRental(data) {
    safeSetItem(STORAGE_KEYS.BUILDING_RENTAL, JSON.stringify(data));
    pushToCloud();
  }

  function getSchedule() {
    try {
      const raw = safeGetItem(STORAGE_KEYS.SCHEDULE);
      let list = raw ? JSON.parse(raw) : null;
      if (!list || !Array.isArray(list) || list.length === 0) {
        list = generateInitialAllSchedules();
        safeSetItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(list));
      }
      return list;
    } catch(e) {
      return generateInitialAllSchedules();
    }
  }

  function saveSchedule(data) {
    safeSetItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(data));
    pushToCloud();
  }

  function getDeletedIds() {
    try {
      const raw = safeGetItem('ssg_deleted_ids_v1');
      return raw ? JSON.parse(raw) : [];
    } catch(e) { return []; }
  }

  function addDeletedId(id) {
    if (!id) return;
    try {
      const list = getDeletedIds();
      if (!list.includes(id)) {
        list.push(id);
        safeSetItem('ssg_deleted_ids_v1', JSON.stringify(list));
      }
    } catch(e) {}
    pushToCloud();
  }

  function getNotices() {
    const deletedIds = getDeletedIds();
    try {
      const raw = safeGetItem(STORAGE_KEYS.NOTICES);
      const list = raw ? JSON.parse(raw) : INITIAL_NOTICES;
      return (list || []).filter(item => item && !deletedIds.includes(item.id));
    } catch(e) { 
      return INITIAL_NOTICES.filter(item => item && !deletedIds.includes(item.id)); 
    }
  }

  function saveNotices(data) {
    const deletedIds = getDeletedIds();
    const cleanList = (data || []).filter(item => item && !deletedIds.includes(item.id));
    safeSetItem(STORAGE_KEYS.NOTICES, JSON.stringify(cleanList));
    pushToCloud();
  }

  function getLeaveRequests() {
    const deletedIds = getDeletedIds();
    try {
      const raw = safeGetItem(STORAGE_KEYS.LEAVE_REQUESTS);
      const list = raw ? JSON.parse(raw) : INITIAL_LEAVE_REQUESTS;
      return (list || []).filter(item => item && !deletedIds.includes(item.id));
    } catch(e) { 
      return INITIAL_LEAVE_REQUESTS.filter(item => item && !deletedIds.includes(item.id)); 
    }
  }

  function saveLeaveRequests(data) {
    const deletedIds = getDeletedIds();
    const cleanList = (data || []).filter(item => item && !deletedIds.includes(item.id));
    safeSetItem(STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify(cleanList));
    pushToCloud();
  }

  function getDiscountPurchases() {
    const deletedIds = getDeletedIds();
    try {
      const raw = safeGetItem(STORAGE_KEYS.DISCOUNT_PURCHASES);
      const list = raw ? JSON.parse(raw) : INITIAL_DISCOUNT_PURCHASES;
      return (list || []).filter(item => item && !deletedIds.includes(item.id));
    } catch(e) { 
      return INITIAL_DISCOUNT_PURCHASES.filter(item => item && !deletedIds.includes(item.id)); 
    }
  }

  const DIRECT_GAS_URL = "https://script.google.com/macros/s/AKfycbx3JgVr9e_wGnO6Bvp2uE_7lamAf_Ii22cLpCyo5OGquAiNypiWA1FCDJSHnw4qqFPMJg/exec";
  let isSyncing = false;

  async function pushToCloud() {
    if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
    try {
      const payload = {
        name: "shinsegae_pharmacy_master_db_v1",
        data: {
          updatedAt: new Date().toISOString(),
          deletedIds: getDeletedIds(),
          employees: getEmployees(),
          schedule: getSchedule(),
          scheduleStatus: safeGetItem(STORAGE_KEYS.SCHEDULE_STATUS) ? JSON.parse(safeGetItem(STORAGE_KEYS.SCHEDULE_STATUS)) : {},
          notices: getNotices(),
          leaveRequests: getLeaveRequests(),
          discountPurchases: getDiscountPurchases(),
          worklogs: getWorklogs(),
          emergencyContacts: getEmergencyContacts(),
          pharmacySettlement: getPharmacySettlement(),
          buildingRental: getBuildingRental(),
          paystubs: getPaystubs(),
          overtimeAdjustments: getOvertimeAdjustments(),
          pharmacistRates: getPharmacistRates()
        }
      };

      // 100% Direct Google Apps Script POST (구글 공식 서버 직통 통신 - Vercel 트래픽 0B)
      const bodyStr = 'payload=' + encodeURIComponent(JSON.stringify(payload));
      await window.fetch(DIRECT_GAS_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: bodyStr
      });

      safeSetItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
      updateSyncStatusUI('success');
    } catch(e) {
      updateSyncStatusUI('error');
    }
  }

  async function pullFromCloud(callback) {
    if (isSyncing || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
    isSyncing = true;
    try {
      let cloudData = null;

      // 100% Direct Google Apps Script GET (구글 공식 서버 직통 조회 - Vercel 트래픽 0B)
      try {
        const gasRes = await window.fetch(DIRECT_GAS_URL + '?t=' + Date.now());
        if (gasRes && gasRes.ok) {
          const rawText = await gasRes.text();
          if (rawText && rawText.startsWith('payload=')) {
            const decoded = decodeURIComponent(rawText.substring(8));
            const gasJson = JSON.parse(decoded);
            if (gasJson && gasJson.data) cloudData = gasJson.data;
          } else if (rawText) {
            const gasJson = JSON.parse(rawText);
            if (gasJson && gasJson.data) cloudData = gasJson.data;
          }
        }
      } catch(gasErr) {
        console.warn('Google Cloud Sync pull notice:', gasErr);
      }

      if (cloudData) {
        let updated = false;

        // 클라우드에서 삭제된 ID 목록 병합
        if (cloudData.deletedIds && Array.isArray(cloudData.deletedIds)) {
          cloudData.deletedIds.forEach(did => addDeletedId(did));
        }

        const activeDeletedIds = getDeletedIds();

        function mergeById(localList, cloudList, dateField = 'createdAt') {
          const map = {};
          (localList || []).forEach(item => {
            if (item && item.id && !activeDeletedIds.includes(item.id)) {
              map[item.id] = item;
            }
          });
          (cloudList || []).forEach(item => {
            if (item && item.id && !activeDeletedIds.includes(item.id)) {
              map[item.id] = item;
            }
          });
          return Object.values(map).sort((a, b) => {
            const pinA = a.isPinned ? 1 : 0;
            const pinB = b.isPinned ? 1 : 0;
            if (pinB !== pinA) return pinB - pinA;
            const timeA = a.createdAt ? Number(a.createdAt) : (new Date(String(a[dateField] || a.date || 0).replace(/-/g, '/')).getTime() || 0);
            const timeB = b.createdAt ? Number(b.createdAt) : (new Date(String(b[dateField] || b.date || 0).replace(/-/g, '/')).getTime() || 0);
            return timeB - timeA;
          });
        }

        function isListDifferent(listA, listB) {
          if (!listA && !listB) return false;
          if (!listA || !listB) return true;
          if (listA.length !== listB.length) return true;
          const mapA = {};
          listA.forEach(item => { if (item && item.id) mapA[item.id] = String(item.updatedAt || item.date || item.createdAt || item.title || item.content || ''); });
          return listB.some(item => !item || !item.id || !mapA[item.id] || mapA[item.id] !== String(item.updatedAt || item.date || item.createdAt || item.title || item.content || ''));
        }

        // 1. 공지사항 & SOP 스마트 비파괴 병합 (삭제된 글 제외)
        if (cloudData.notices && Array.isArray(cloudData.notices)) {
          const localNotices = getNotices() || [];
          const mergedNotices = mergeById(localNotices, cloudData.notices, 'date');
          if (isListDifferent(localNotices, mergedNotices)) {
            safeSetItem(STORAGE_KEYS.NOTICES, JSON.stringify(mergedNotices));
            updated = true;
          }
        }

        // 2. 업무일지 스마트 비파괴 병합 (삭제된 글 제외)
        if (cloudData.worklogs && Array.isArray(cloudData.worklogs)) {
          const localLogs = getWorklogs() || [];
          const mergedLogs = mergeById(localLogs, cloudData.worklogs, 'createdAt');
          if (isListDifferent(localLogs, mergedLogs)) {
            safeSetItem(STORAGE_KEYS.WORKLOGS, JSON.stringify(mergedLogs));
            updated = true;
          }
        }

        // 3. 연차 신청 스마트 비파괴 병합 (삭제된 글 제외)
        if (cloudData.leaveRequests && Array.isArray(cloudData.leaveRequests)) {
          const localLeaves = getLeaveRequests() || [];
          const mergedLeaves = mergeById(localLeaves, cloudData.leaveRequests, 'createdAt');
          if (isListDifferent(localLeaves, mergedLeaves)) {
            safeSetItem(STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify(mergedLeaves));
            updated = true;
          }
        }

        // 4. 직원할인구매 스마트 비파괴 병합 (삭제된 글 제외)
        if (cloudData.discountPurchases && Array.isArray(cloudData.discountPurchases)) {
          const localDiscounts = getDiscountPurchases() || [];
          const mergedDiscounts = mergeById(localDiscounts, cloudData.discountPurchases, 'date');
          if (isListDifferent(localDiscounts, mergedDiscounts)) {
            safeSetItem(STORAGE_KEYS.DISCOUNT_PURCHASES, JSON.stringify(mergedDiscounts));
            updated = true;
          }
        }

        // 5. 월간 근무 스케줄 스마트 비파괴 병합 (날짜 + 직원ID 고유키로 1일부터 31일까지 모든 일자 100% 영구 보존)
        if (cloudData.schedule && Array.isArray(cloudData.schedule)) {
          const localSched = getSchedule() || [];
          const map = {};
          localSched.forEach(s => {
            if (s && s.date && s.empId) {
              map[`${s.date}_${s.empId}`] = s;
            }
          });
          cloudData.schedule.forEach(s => {
            if (s && s.date && s.empId) {
              map[`${s.date}_${s.empId}`] = s;
            }
          });
          const cur = safeGetItem(STORAGE_KEYS.SCHEDULE);
          const next = JSON.stringify(Object.values(map));
          if (cur !== next) {
            safeSetItem(STORAGE_KEYS.SCHEDULE, next);
            updated = true;
          }
        }

        // 6. 스케줄 상태 및 반려 코멘트 병합
        if (cloudData.scheduleStatus) {
          const localStatus = safeGetItem(STORAGE_KEYS.SCHEDULE_STATUS) ? JSON.parse(safeGetItem(STORAGE_KEYS.SCHEDULE_STATUS)) : {};
          const mergedStatus = { ...localStatus, ...cloudData.scheduleStatus };
          const cur = safeGetItem(STORAGE_KEYS.SCHEDULE_STATUS);
          const next = JSON.stringify(mergedStatus);
          if (cur !== next) {
            safeSetItem(STORAGE_KEYS.SCHEDULE_STATUS, next);
            updated = true;
          }
        }

        // 7. 급여명세서 및 추가 수당/공제 병합
        if (cloudData.paystubs) {
          const localPs = getPaystubs();
          const mergedPs = { ...localPs, ...cloudData.paystubs };
          const cur = safeGetItem(STORAGE_KEYS.PAYSTUBS);
          const next = JSON.stringify(mergedPs);
          if (cur !== next) {
            safeSetItem(STORAGE_KEYS.PAYSTUBS, next);
            updated = true;
          }
        }
        if (cloudData.overtimeAdjustments) {
          const localAdj = getOvertimeAdjustments();
          const mergedAdj = { ...localAdj, ...cloudData.overtimeAdjustments };
          const cur = safeGetItem(STORAGE_KEYS.OVERTIME_ADJUSTMENTS);
          const next = JSON.stringify(mergedAdj);
          if (cur !== next) {
            safeSetItem(STORAGE_KEYS.OVERTIME_ADJUSTMENTS, next);
            updated = true;
          }
        }

        // 8. 직원 명부 및 시급/권한 스마트 비파괴 병합 (PC ↔ 스마트폰 최신 타임스탬프 자동 감지 동기화)
        if (cloudData.employees && Array.isArray(cloudData.employees)) {
          const localEmps = getEmployees() || [];
          const localMap = {};
          localEmps.forEach(e => { if (e && e.id) localMap[e.id] = e; });
          
          const finalMap = {};
          cloudData.employees.forEach(ce => {
            if (!ce || !ce.id) return;
            const le = localMap[ce.id];
            if (!le) {
              finalMap[ce.id] = ce;
            } else {
              const cTime = Number(ce.updatedAt) || 0;
              const lTime = Number(le.updatedAt) || 0;
              finalMap[ce.id] = (cTime >= lTime) ? ce : le;
            }
          });

          // 로컬에만 있고 클라우드에 아직 없는 신규 등록자 보존
          localEmps.forEach(le => {
            if (le && le.id && !finalMap[le.id]) {
              finalMap[le.id] = le;
            }
          });

          let mergedEmps = Object.values(finalMap);
          const currentJson = safeGetItem(STORAGE_KEYS.EMPLOYEES);
          const newJson = JSON.stringify(mergedEmps);
          if (currentJson !== newJson) {
            safeSetItem(STORAGE_KEYS.EMPLOYEES, newJson);
            updated = true;
          }
        }

        // 9. 약사 시급 및 휴게 설정 단일 마스터 연동
        if (cloudData.pharmacistRates) {
          const localRates = getPharmacistRates();
          const mergedRates = { ...localRates, ...cloudData.pharmacistRates };
          safeSetItem(STORAGE_KEYS.PHARMACIST_RATES, JSON.stringify(mergedRates));
        }

        safeSetItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
        updateSyncStatusUI('success');

        if (updated) {
          // 🔒 사용자가 어떤 입력창(input/textarea/select)에서든 타이핑 중이거나 모달이 열려있으면 화면 덮어쓰기 방지
          const activeEl = document.activeElement;
          const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT');
          const isEditingStaff = window.StaffDirectoryModule && window.StaffDirectoryModule.isEditing && window.StaffDirectoryModule.isEditing();
          
          const anyOpenModal = Array.from(document.querySelectorAll('.modal-overlay')).some(m => {
            const disp = window.getComputedStyle(m).display;
            return disp !== 'none' && disp !== '';
          });

          if (!isTyping && !isEditingStaff && !anyOpenModal) {
            if (typeof callback === 'function') callback();
            if (window.App && typeof window.App.renderActiveModule === 'function') {
              window.App.renderActiveModule();
              window.App.renderSidebarNavigation();
            }
            if (window.App && typeof window.App.checkPendingRejectionNotice === 'function') {
              window.App.checkPendingRejectionNotice();
            }
            if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
              window.dispatchEvent(new CustomEvent('ssg_cloud_updated'));
            }
          }
        }
      } else {
        // 🚀 클라우드가 비어있거나 초기 상태일 경우 로컬의 최신 데이터를 클라우드로 자동 시딩(전송)
        const localLogs = getWorklogs() || [];
        if (localLogs.length > 0) {
          pushToCloud();
        }
      }
    } catch(e) {
      console.warn('Pull cloud error:', e);
    } finally {
      isSyncing = false;
    }
  }

  // 🌐 JSONP 기반 100% 무제한 크로스도메인 구글 스프레드시트 직통 로더 (file:/// 및 웹 배포 모두 완벽 호환)
  function fetchSheetGvizJsonp(sheetId, sheetName) {
    return new Promise((resolve, reject) => {
      const callbackName = '_gviz_cb_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
      const script = document.createElement('script');
      
      const timeout = setTimeout(() => {
        cleanup();
        resolve([]);
      }, 8000);

      function cleanup() {
        clearTimeout(timeout);
        delete window[callbackName];
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[callbackName] = function(json) {
        cleanup();
        if (json && json.table && json.table.rows) {
          const rows = json.table.rows.map(r => (r.c || []).map(cell => (cell ? (cell.v !== undefined ? cell.v : (cell.f || '')) : '')));
          resolve(rows);
        } else {
          resolve([]);
        }
      };

      script.onerror = function() {
        cleanup();
        resolve([]);
      };

      script.src = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?sheet=${encodeURIComponent(sheetName)}&tqx=responseHandler:${callbackName}&t=${Date.now()}`;
      document.body.appendChild(script);
    });
  }

  // 🌐 구글 스프레드시트 탭별 실시간 직통 동기화 엔진 (URL 기반 자동 파싱 & 스마트 병합)
  async function syncDirectWithGoogleSheet(customSheetId) {
    const sheetId = customSheetId || "16yVS9f9bQs9Z2S1k2McnxhHGb9QjQguPa93MxZvNtP0";
    let updatedCount = 0;
    try {
      // 1. 직원명부 탭 JSONP 동기화
      const empRows = await fetchSheetGvizJsonp(sheetId, '직원명부');
      if (empRows && empRows.length > 0) {
        const currentEmps = getEmployees() || [];
        const empsMap = {};
        currentEmps.forEach(e => { empsMap[e.id] = e; });

        empRows.forEach((parts, idx) => {
          const empId = parts[0] ? String(parts[0]).trim() : '';
          const empName = parts[1] ? String(parts[1]).trim() : '';
          if (empName && empName !== '' && empName !== '성명') {
            const hourlyVal = parseInt(parts[6]) || ((parts[2] && String(parts[2]).includes('약사')) ? 35000 : 13000);
            const baseSalVal = parseInt(parts[6]) || 2490000;
            const usedLeaveVal = parseInt(parts[9]) || 0;
            const memoVal = parts[10] ? String(parts[10]) : (isNaN(parts[9]) && parts[9] ? String(parts[9]) : '구글 시트 연동');

            empsMap[empId || `emp_sheet_${idx + 1}`] = {
              ...(empsMap[empId] || {}),
              id: empId || `emp_sheet_${idx + 1}`,
              name: empName,
              role: parts[2] ? String(parts[2]) : '일반직원',
              position: parts[3] ? String(parts[3]) : (parts[2] ? String(parts[2]) : ''),
              payType: parts[4] ? String(parts[4]) : ((parts[2] && String(parts[2]).includes('약사')) ? 'HOURLY' : 'MONTHLY'),
              joinDate: parts[5] ? String(parts[5]) : '2026-08-18',
              hourlyRate: hourlyVal,
              baseMonthlySalary: baseSalVal,
              phone: parts[7] ? String(parts[7]) : '010-0000-0000',
              email: parts[8] ? String(parts[8]) : `${empId || 'user'}@shinsegae.com`,
              username: parts[8] ? String(parts[8]) : `${empId || 'user'}@shinsegae.com`,
              passcode: (empsMap[empId] && empsMap[empId].passcode) ? empsMap[empId].passcode : '1234',
              usedLeave: usedLeaveVal,
              memo: memoVal,
              allowedTabs: (empsMap[empId] && empsMap[empId].allowedTabs) ? empsMap[empId].allowedTabs : [...ALL_COMMON_TABS]
            };
            updatedCount++;
          }
        });
        const mergedList = Object.values(empsMap);
        saveEmployees(mergedList);
      }

      // 2. 일일결산 탭 JSONP 동기화
      const settleRows = await fetchSheetGvizJsonp(sheetId, '일일결산');
      if (settleRows && settleRows.length > 0) {
        const pData = getPharmacySettlement();
        if (!pData.dailyLogs) pData.dailyLogs = [];
        settleRows.forEach(parts => {
          const dateVal = parts[0] ? String(parts[0]).trim() : '';
          if (dateVal && dateVal.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const disp = Number(parts[2]) || 0;
            const pos = Number(parts[3]) || 0;
            const tot = Number(parts[4]) || (disp + pos);
            const card = Number(parts[5]) || Math.round(tot * 0.85);
            const cash = Number(parts[6]) || (tot - card);
            const exp = Number(parts[7]) || 0;
            const note = parts[8] ? String(parts[8]) : '구글 시트 연동';

            const target = pData.dailyLogs.find(l => l.date === dateVal);
            if (target) {
              target.dispensingRevenue = disp;
              target.posRevenue = pos;
              target.totalRevenue = tot;
              target.cardPay = card;
              target.cashPay = cash;
              target.dailyExpense = exp;
              target.note = note;
            }
          }
        });
        savePharmacySettlement(pData);
      }

      return { success: true, count: updatedCount };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  function updateSyncStatusUI(status) {
    const el = document.getElementById('cloud-sync-badge');
    if (el) {
      if (status === 'success') {
        el.innerHTML = '<span class="badge bg-success" style="font-size:11.5px; padding:5px 9px; border-radius:12px;"><i class="fas fa-cloud-check me-1"></i> <span class="sync-badge-full-text">☁️ 실시간 클라우드 공유 연동 중</span><span class="sync-badge-short-text">☁️ 연동중</span></span>';
      } else {
        el.innerHTML = '<span class="badge bg-secondary" style="font-size:11.5px; padding:5px 9px; border-radius:12px;"><i class="fas fa-cloud me-1"></i> <span class="sync-badge-full-text">☁️ 동기화 가동 중</span><span class="sync-badge-short-text">☁️ 동기화</span></span>';
      }
    }
  }

  // 앱 시동, 화면 복귀(Focus/Visibility), 및 3.5초 주기 초고속 실시간 백그라운드 동기화
  if (typeof window !== 'undefined') {
    setTimeout(() => {
      pullFromCloud();
      setTimeout(() => pushToCloud(), 1000);
    }, 300);
    window.addEventListener('focus', () => pullFromCloud());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') pullFromCloud();
    });
    setInterval(() => pullFromCloud(), 3500); // 🚀 3.5초 초고속 실시간 무자각 자동 동기화!
  }

  function saveDiscountPurchases(data) {
    safeSetItem(STORAGE_KEYS.DISCOUNT_PURCHASES, JSON.stringify(data));
    pushToCloud();
  }

  function getSheetUrl() {
    return safeGetItem(STORAGE_KEYS.SHEET_URL) || DEFAULT_SHEET_URL;
  }

  function setSheetUrl(url) {
    safeSetItem(STORAGE_KEYS.SHEET_URL, url);
  }

  function getPaystubs() {
    const raw = safeGetItem(STORAGE_KEYS.PAYSTUBS);
    return raw ? JSON.parse(raw) : {};
  }

  function savePaystubs(data) {
    safeSetItem(STORAGE_KEYS.PAYSTUBS, JSON.stringify(data));
    pushToCloud();
  }

  function getOvertimeAdjustments() {
    const raw = safeGetItem(STORAGE_KEYS.OVERTIME_ADJUSTMENTS);
    return raw ? JSON.parse(raw) : {};
  }

  function saveOvertimeAdjustments(data) {
    safeSetItem(STORAGE_KEYS.OVERTIME_ADJUSTMENTS, JSON.stringify(data));
    pushToCloud();
  }

  function getData() {
    return {
      employees: getEmployees(),
      schedule: getSchedule(),
      scheduleStatus: safeGetItem(STORAGE_KEYS.SCHEDULE_STATUS) ? JSON.parse(safeGetItem(STORAGE_KEYS.SCHEDULE_STATUS)) : {},
      notices: getNotices(),
      leaveRequests: getLeaveRequests(),
      discountPurchases: getDiscountPurchases(),
      worklogs: getWorklogs(),
      emergencyContacts: getEmergencyContacts(),
      pharmacySettlement: getPharmacySettlement(),
      buildingRental: getBuildingRental(),
      paystubs: getPaystubs(),
      overtimeAdjustments: getOvertimeAdjustments()
    };
  }

  function saveData(key, data) {
    safeSetItem(key, typeof data === 'string' ? data : JSON.stringify(data));
    pushToCloud();
  }

  function getPharmacistRates() {
    const emps = getEmployees() || [];
    const ratesMap = {};
    emps.filter(e => e.role === '근무약사' || (e.role || '').includes('약사')).forEach(e => {
      ratesMap[e.id] = {
        weekdayRate: Number(e.weekdayRate) || Number(e.hourlyRate) || 35000,
        holidayRate: Number(e.holidayRate) || 40000,
        breakHours: 1.0
      };
    });
    return ratesMap;
  }

  function savePharmacistRates(rates) {
    if (!rates) return;
    const emps = getEmployees() || [];
    let changed = false;
    emps.forEach(e => {
      if (rates[e.id]) {
        if (rates[e.id].weekdayRate !== undefined) e.weekdayRate = Number(rates[e.id].weekdayRate);
        if (rates[e.id].holidayRate !== undefined) e.holidayRate = Number(rates[e.id].holidayRate);
        if (rates[e.id].weekdayRate !== undefined) e.hourlyRate = Number(rates[e.id].weekdayRate);
        e.updatedAt = Date.now();
        changed = true;
      }
    });
    if (changed) {
      saveEmployees(emps);
    }
  }

  return {
    STORAGE_KEYS,
    getData,
    saveData,
    getCurrentUser,
    setCurrentUser,
    logoutUser,
    validatePasswordComplexity,
    changePassword,
    resetPassword,
    updateStaffPermissions,
    getEmployees,
    saveEmployees,
    getWorklogs,
    saveWorklogs,
    getEmergencyContacts,
    saveEmergencyContacts,
    getPharmacySettlement,
    savePharmacySettlement,
    getBuildingRental,
    saveBuildingRental,
    getSchedule,
    saveSchedule,
    getNotices,
    saveNotices,
    getLeaveRequests,
    saveLeaveRequests,
    getDiscountPurchases,
    saveDiscountPurchases,
    getDeletedIds,
    addDeletedId,
    getPaystubs,
    savePaystubs,
    getOvertimeAdjustments,
    saveOvertimeAdjustments,
    getPharmacistRates,
    savePharmacistRates,
    generateScheduleForMonth,
    pushToCloud,
    pullFromCloud,
    syncDirectWithGoogleSheet,
    getSheetUrl,
    setSheetUrl
  };
})();
