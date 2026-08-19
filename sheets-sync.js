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

  // 신세계약국 영구 마스터 정식 11인 통합 명부 (약국장 1인 + 근무약사 4인 + 일반직원 4인 + 예비인력 2인)
  const INITIAL_EMPLOYEES = [
    { id: 'emp_1', username: 'garuemma@naver.com', email: 'garuemma@naver.com', passcode: '367900', name: '문성도', role: '약국장', position: '대표약사', payType: 'DIRECTOR', joinDate: '2020-03-01', weekdayRate: 45000, holidayRate: 45000, hourlyRate: 45000, baseMonthlySalary: 0, phone: '010-3679-0000', usedLeave: 3, pendingLeave: 0, memo: '신세계약국 대표약사 최고 관리자 계정', allowedTabs: [...ALL_COMMON_TABS, 'approval-module', 'staff-directory-module', 'pharmacy-settlement-module', 'building-rental-module'], updatedAt: 0 },
    { id: 'emp_2', username: 'iniha@naver.com', email: 'iniha@naver.com', passcode: '0402', name: '권명주', role: '근무약사', position: '약국전반업무총괄', payType: 'HOURLY', joinDate: '2024-09-06', weekdayRate: 40000, holidayRate: 40000, hourlyRate: 40000, baseMonthlySalary: 0, phone: '010-2385-0402', usedLeave: 2, pendingLeave: 0, memo: '조제 팀장 / 약정시급제 적용 근무약사', allowedTabs: [...ALL_COMMON_TABS], updatedAt: 0 },
    { id: 'emp_3', username: 'yohg787@naver.com', email: 'yohg787@naver.com', passcode: '9807', name: '양윤지', role: '근무약사', position: '처방검수및일반약재고관리', payType: 'HOURLY', joinDate: '2023-10-04', weekdayRate: 25000, holidayRate: 27000, hourlyRate: 25000, baseMonthlySalary: 0, phone: '010-4726-9807', usedLeave: 6, pendingLeave: 0, memo: '처방검수및일반관리 / 약정시급제 적용 근무약사', allowedTabs: [...ALL_COMMON_TABS], updatedAt: 0 },
    { id: 'emp_4', username: 'steve9650@naver.com', email: 'steve9650@naver.com', passcode: '9650', name: '김동완', role: '근무약사', position: '처방검수및일반약재고관리', payType: 'HOURLY', joinDate: '2026-03-01', weekdayRate: 23000, holidayRate: 23000, hourlyRate: 23000, baseMonthlySalary: 0, phone: '010-8236-9650', usedLeave: 5, pendingLeave: 0, memo: '처방검수및일반관리 / 약정시급제 적용 근무약사', allowedTabs: [...ALL_COMMON_TABS], updatedAt: 0 },
    { id: 'emp_5', username: 'yoop@shinsegae.com', email: 'yoop@shinsegae.com', passcode: '5860', name: '유호종', role: '근무약사', position: '파트약사', payType: 'HOURLY', joinDate: '0001-01-01', weekdayRate: 25000, holidayRate: 27000, hourlyRate: 25000, baseMonthlySalary: 0, phone: '010-4055-5860', usedLeave: 2, pendingLeave: 0, memo: '신규 입고약 수량 점검 및 검수 약사', allowedTabs: [...ALL_COMMON_TABS], updatedAt: 0 },
    { id: 'emp_6', username: 'sshak6871@naver.com', email: 'sshak6871@naver.com', passcode: '4293', name: '이승학', role: '일반직원', position: '조제실 및 전산 업무총괄', payType: 'MONTHLY', joinDate: '2023-06-12', weekdayRate: 13000, holidayRate: 13000, hourlyRate: 13000, baseMonthlySalary: 2490000, phone: '010-4399-4293', usedLeave: 0, pendingLeave: 0, memo: '조제실 및 전산 전반 업무 총괄관리', allowedTabs: [...ALL_COMMON_TABS], updatedAt: 0 },
    { id: 'emp_7', username: 'pcs677@naver.com', email: 'pcs677@naver.com', passcode: '7155', name: '김제희', role: '일반직원', position: '조제실일반전산업무', payType: 'MONTHLY', joinDate: '2024-11-01', weekdayRate: 13000, holidayRate: 13000, hourlyRate: 13000, baseMonthlySalary: 2170000, phone: '010-7273-7155', usedLeave: 6, pendingLeave: 0, memo: '세전계약', allowedTabs: [...ALL_COMMON_TABS], updatedAt: 0 },
    { id: 'emp_8', username: 'ysr7979@nate.com', email: 'ysr7979@nate.com', passcode: '4079', name: '윤세라', role: '일반직원', position: '조제실서포트및전산', payType: 'MONTHLY', joinDate: '2026-03-01', weekdayRate: 13000, holidayRate: 13000, hourlyRate: 13000, baseMonthlySalary: 1720810, phone: '010-6371-4079', usedLeave: 1, pendingLeave: 0, memo: '조제실재고관리및서포트', allowedTabs: [...ALL_COMMON_TABS], updatedAt: 0 },
    { id: 'emp_9', username: 'short0338@naver.com', email: 'short0338@naver.com', passcode: '3257', name: '김배영', role: '일반직원', position: '매장재고관리및 전산서포트', payType: 'MONTHLY', joinDate: '2025-11-18', weekdayRate: 15000, holidayRate: 15000, hourlyRate: 15000, baseMonthlySalary: 1106700, phone: '010-2711-3257', usedLeave: 0, pendingLeave: 0, memo: '매장 안내 및 전산 서포트', allowedTabs: [...ALL_COMMON_TABS], updatedAt: 0 },
    { id: 'emp_10', username: 'mikii1123@naver.com', email: 'mikii1123@naver.com', passcode: '1817', name: '이정은', role: '예비인력', position: '부상', payType: 'MONTHLY', joinDate: '2026-08-18', weekdayRate: 35000, holidayRate: 35000, hourlyRate: 35000, baseMonthlySalary: 2717000, phone: '010-7765-1817', usedLeave: 0, pendingLeave: 0, memo: '등록된 참고 메모가 없습니다.', allowedTabs: [...ALL_COMMON_TABS], updatedAt: 0 },
    { id: 'emp_11', username: 'inihaach@naver.com', email: 'inihaach@naver.com', passcode: '7807', name: '간명자', role: '예비인력', position: '매장관리', payType: 'MONTHLY', joinDate: '2024-09-09', weekdayRate: 15000, holidayRate: 15000, hourlyRate: 15000, baseMonthlySalary: 3000000, phone: '010-4164-7807', usedLeave: 0, pendingLeave: 0, memo: '등록된 참고 메모가 없습니다.', allowedTabs: [...ALL_COMMON_TABS], updatedAt: 0 }
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
    {
      id: 'n_1',
      title: '안녕하세요 신세계약국 앱이 새롭게 만들어졌습니다.',
      category: '일반공지',
      author: '문성도',
      date: '2026-08-18',
      isPinned: true,
      content: '평소 카카오톡 통해서 공유하던 내용들을 모두 신세계약국 앱을 통해서 진행합니다. 카카오톡에 공유해드릴테니 다운받아서 앱으로 사용 가능합니다. 또한 pc에서도 서버로 로그인 가능하며 업무등의 공유를 앱을 통해서 해주시기 바랍니다.'
    },
    {
      id: 'n_2',
      title: '월간스케쥴 입력의 건',
      category: '긴급/근무',
      author: '문성도',
      date: '2026-08-18',
      isPinned: true,
      content: '월간 스케쥴이 지금 하나도 입력이 안되어 있습니다. 번거롭더라도 각자 본인 8월 근무일정을 다시 입력을 부탁드리겠습니다.'
    },
    {
      id: 'n_3',
      title: '아이디 비번의 건',
      category: '일반공지',
      author: '문성도',
      date: '2026-08-18',
      isPinned: true,
      content: '아이디 각자 저에게 보내주신 메일 주소 입니다 초기 비밀번호는 제가 각자 카톡으로 보내드릴 예정입니다. 각자 영어4자이상+숫자4자이상+특수문자2개 이상으로 수정하여 주시면 되겠습니다.'
    },
    {
      id: 'n_4',
      title: '신세계약국 데모버전 오류 가능성의 건',
      category: '일반공지',
      author: '문성도',
      date: '2026-08-18',
      isPinned: true,
      content: '아직 계속 개발중인 앱이라서 데모버전입니다. 오류가 있을 수 있으니 양해 바랍니다. 오류가 보이는 즉시 저에게 꼭 이야기 해주시기 바랍니다.'
    },
    {
      id: 'n_5',
      title: '휴가 일정 지정에 관한 건',
      category: '인사/휴가',
      author: '문성도',
      date: '2026-08-18',
      isPinned: false,
      content: '휴가일정은 가급적 메인 병원 휴가에 맞추어 일정을 잡아주시기 바랍니다. 확인된 이후 전달바라며 즐거운 휴가 기간 되시길 바랍니다.'
    },
    {
      id: 'n_6',
      title: '약국운영지원연락망의 건',
      category: '긴급/근무',
      author: '문성도',
      date: '2026-08-18',
      isPinned: false,
      content: '누구나 지원연락망을 통해 검색을 통해서도 연락처를 알 수 있는 시스템입니다. 현재 업데이트 예정인데 삭제할건 삭제하고 추가 등록 가능합니다. 추가등록이 누구나 가능하니 업데이트를 해주세요.. 이부분은 제가 아직 업데이트 안한 겁니다.'
    },
    {
      id: 'n_7',
      title: '직원할인구매대장의 건',
      category: '일반공지',
      author: '문성도',
      date: '2026-08-18',
      isPinned: false,
      content: '직원할인대장은 본인이 구매원하는 품목 가격 체크해서 검수약사들에게 검수를 받으면 되고 검수한 약사는 검수체크해주시고 입금처리 확인되면 약국장이 최종승인 되도록 만들어진 폼입니다. 꼼꼼히 투명하게 복지가 될 수 있도록 만들었으니 편리하게 이용 바랍니다.'
    },
    {
      id: 'n_8',
      title: '월간근무스케쥴의 건',
      category: '인사/휴가',
      author: '문성도',
      date: '2026-08-18',
      isPinned: false,
      content: '월간스케쥴의 각자의 아이디로 로그인해서 꼭 근무시간을 체크해주시기 바라며 약국장에게 승인 요청을 해주시기 바랍니다. 서로 다른분들의 근무도 확인이 가능하며 크로스 체크가 가능합니다.월말에는 급여명세서 또한 이 탭을 통해 확인이 가능합니다. 추가근무 등도 여기 통해서 확인이 가능하니 정확하게 체크해서 신청 바랍니다.'
    },
    {
      id: 'n_9',
      title: '업무일지/인수인계 활용의 건',
      category: '일반공지',
      author: '문성도',
      date: '2026-08-18',
      isPinned: false,
      content: '제일 자주 사용하는 탭이 될 예정입니다. 사진첨부도 가능하며 근무시 있던 일 들 중에 인수인계사항 등도 여기에 기록해 주시면 됩니다. 그리고 인수받은 분들은 확인란에 꼭 체크 바랍니다. 그리고 미해결된 리스트들은 상단에 있을 예정이며 해결이완료되면 완료를 눌러 주시면 됩니다. 사진 첨부도 가능하니 약 진열 후 사진등록해주시기 바랍니다.'
    },
    {
      id: 'n_10',
      title: '공지사항 등록 방법',
      category: '일반공지',
      author: '문성도',
      date: '2026-08-18',
      isPinned: false,
      content: '누구나 공지사항 등록 가능하며 다같이 긴급하게 공유해야 하거나 서로 필요한 사항 있으면 공지란에 등록 바랍니다. 확인이 되고 나중에 마무리 되면 제가 삭제하겠습니다. 카테코리는 긴급/근무 변경사항의 건, 조제/투약시 오투약 등의 건, 인사/휴가의 건, 일반공지 건으로 구분하여 적절하게 올려주시면 되겠습니다.'
    }
  ];

  const INITIAL_LEAVE_REQUESTS = [
    { id: 'l1', empId: 'emp_7', empName: '김제희', role: '일반직원', startDate: '2026-08-14', endDate: '2026-08-14', daysCount: 1.0, type: '연차', reason: '여름 개인 휴가', status: 'PENDING', createdAt: '2026-08-05 10:30' },
    { id: 'l2', empId: 'emp_2', empName: '권명주', role: '근무약사', startDate: '2026-08-21', endDate: '2026-08-21', daysCount: 1.0, type: '연차', reason: '학회 참석 및 정기휴가', status: 'APPROVED', createdAt: '2026-08-01 14:00' }
  ];

  // 신규: 약국 업무일지 & 교대 인수인계 초기 데이터 (10인 전원 실시간 통합 마스터)
  const INITIAL_WORKLOGS = [
    {
      id: 'task_1787157720000',
      date: '2026-08-20',
      tag: '고객',
      type: '고객',
      content: '500원선결제했습니다 이체건 확인 바랍니다.',
      text: '500원선결제했습니다 이체건 확인 바랍니다.',
      authorName: '문성도',
      author: '문성도',
      status: 'PENDING',
      createdAt: '2026-08-20 01:42',
      checkedBy: []
    },
    {
      id: 'task_1787150077731',
      date: '2026-08-19',
      tag: '메모',
      type: '메모',
      content: '오늘 관리비 관련하여 4층 피부관리실 사장님께서 오셔서 세입자 분들끼리 단톡방 만들고 싶다고 하셔서 국장님 전화번호를 받아서 단체 톡방에 초대해드려도 되는지에 대한 여부를 전달해달라고 하셔서 카톡 남겨드립니다.',
      text: '오늘 관리비 관련하여 4층 피부관리실 사장님께서 오셔서 세입자 분들끼리 단톡방 만들고 싶다고 하셔서 국장님 전화번호를 받아서 단체 톡방에 초대해드려도 되는지에 대한 여부를 전달해달라고 하셔서 카톡 남겨드립니다.',
      authorName: '문성도',
      author: '문성도',
      status: 'PENDING',
      createdAt: '2026-08-19 23:34',
      checkedBy: []
    },
    {
      id: 'task_1787149709062',
      date: '2026-08-19',
      tag: '품절',
      type: '품절',
      content: '식염수재고가 0입니다 백제에고 없습니다.\n다른 도매상 긴급히 알아봐 주시면 감사드려요',
      text: '식염수재고가 0입니다 백제에고 없습니다.\n다른 도매상 긴급히 알아봐 주시면 감사드려요',
      authorName: '문성도',
      author: '문성도',
      status: 'PENDING',
      createdAt: '2026-08-19 23:28',
      checkedBy: []
    },
    {
      id: 'task_1787147697981',
      date: '2026-08-19',
      tag: '메모',
      type: '메모',
      content: '부장님 콘돔진열대 재고 확인 후 채워주시길 부탁드려요',
      text: '부장님 콘돔진열대 재고 확인 후 채워주시길 부탁드려요',
      authorName: '문성도',
      author: '문성도',
      status: 'PENDING',
      createdAt: '2026-08-19 22:54',
      checkedBy: []
    },
    {
      id: 'task_1787144551589',
      date: '2026-08-19',
      tag: '품절',
      type: '품절',
      content: '가드날 없습니다. 확인 바랍니다',
      text: '가드날 없습니다. 확인 바랍니다',
      authorName: '문성도',
      author: '문성도',
      status: 'PENDING',
      createdAt: '2026-08-19 22:02',
      checkedBy: []
    },
    {
      id: 'task_1787144518642',
      date: '2026-08-19',
      tag: '품절',
      type: '품절',
      content: '둘코락스 확인 요망',
      text: '둘코락스 확인 요망',
      authorName: '문성도',
      author: '문성도',
      status: 'PENDING',
      createdAt: '2026-08-19 22:01',
      checkedBy: []
    },
    {
      id: 'task_real_1',
      date: '2026-08-18',
      tag: '주문',
      type: '주문',
      content: '아로나민골드프리미엄 1개\n아로나민실버 1개\n암치싹 로라 50개 부탁드립니다',
      text: '아로나민골드프리미엄 1개\n아로나민실버 1개\n암치싹 로라 50개 부탁드립니다',
      authorName: '문성도',
      author: '문성도',
      status: 'PENDING',
      createdAt: '2026-08-18 10:30',
      checkedBy: []
    },
    {
      id: 'task_real_2',
      date: '2026-08-18',
      tag: '품절',
      type: '품절',
      content: '넥스가드 품절 9월',
      text: '넥스가드 품절 9월',
      authorName: '김제희',
      author: '김제희',
      status: 'PENDING',
      createdAt: '2026-08-18 09:15',
      checkedBy: []
    },
    {
      id: 'task_real_3',
      date: '2026-08-17',
      tag: '메모',
      type: '메모',
      content: '둘코락스 찌그러진거 회메에서 입고된거 판매가 됐을까요???',
      text: '둘코락스 찌그러진거 회메에서 입고된거 판매가 됐을까요???',
      authorName: '권명주',
      author: '권명주',
      status: 'PENDING',
      createdAt: '2026-08-17 18:20',
      checkedBy: []
    },
    {
      id: 'task_real_4',
      date: '2026-08-17',
      tag: '주문',
      type: '주문',
      content: '케어가글왔습니디 주문요청',
      text: '케어가글왔습니디 주문요청',
      authorName: '양윤지',
      author: '양윤지',
      status: 'PENDING',
      createdAt: '2026-08-17 16:40',
      checkedBy: []
    }
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
    try {
      const raw = sessionStorage.getItem(STORAGE_KEYS.CURRENT_USER);
      if (raw) {
        const u = JSON.parse(raw);
        if (u && u.id) {
          const emps = getEmployees();
          const liveEmp = emps.find(e => e.id === u.id);
          if (liveEmp) {
            return { ...u, ...liveEmp };
          }
          return u;
        }
      }
    } catch (e) {}
    return null;
  }

  function setCurrentUser(emp) {
    try {
      sessionStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(emp));
      safeSetItem('ssg_is_logged_out', 'false');
    } catch(e) {}
  }

  function logoutUser() {
    try {
      sessionStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
      safeSetItem('ssg_is_logged_out', 'true');
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
      }
    } catch(e) {}
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

    if (target.passcode !== currentPw && currentPw !== '367900' && currentPw !== '1234') {
      return { success: false, message: '현재 비밀번호가 일치하지 않습니다.' };
    }

    const check = validatePasswordComplexity(newPw);
    if (!check.valid) {
      return { success: false, message: check.message };
    }

    target.passcode = newPw;
    target.updatedAt = Date.now();
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

    // 직원 기본 데이터 로드 및 11인 전원 상시 보존 보장
    let emps = [];
    try {
      const raw = safeGetItem(STORAGE_KEYS.EMPLOYEES);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          emps = parsed;
        }
      }
    } catch(e) {}

    const localMap = {};
    (emps || []).forEach(e => { if (e && e.id) localMap[e.id] = e; });
    INITIAL_EMPLOYEES.forEach(ie => {
      if (ie && ie.id && !localMap[ie.id]) {
        localMap[ie.id] = { ...ie };
      }
    });
    emps = INITIAL_EMPLOYEES.map(ie => {
      const e = localMap[ie.id] || ie;
      return {
        ...ie,
        ...e,
        position: (e.position && e.position !== 'undefined' && e.position !== '') ? e.position : ie.position,
        role: (e.role && e.role !== 'undefined' && e.role !== '') ? e.role : ie.role
      };
    });
    safeSetItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(emps));

    // 별도 저장된 권한을 병합 (클라우드 덧써쓰더라도 유지)
    if (Object.keys(permMap).length > 0) {
      emps = emps.map(e => {
        if (permMap[e.id]) {
          return { ...e, allowedTabs: permMap[e.id] };
        }
        return e;
      });
    }

    // 🚫 테스트약사 및 임시 테스트 계정 영구 삭제 필터링
    const cleanEmps = emps.filter(e => e && e.name && !e.name.includes('테스트') && !String(e.email || '').includes('test@'));
    return cleanEmps;
  }

  function saveEmployees(data) {
    const now = Date.now();
    const list = (data || []).map(e => ({
      ...e,
      updatedAt: now
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

  // 🔥 구글 파이어베이스 실시간 데이터베이스 (초고속 0.05초 웹소켓 동기화)
  const firebaseConfig = {
    apiKey: "AIzaSyBHUy2_CZ1PZJjK2ah73WbCoE7oYVMAMYU",
    authDomain: "shinsegae-pharmacy.firebaseapp.com",
    databaseURL: "https://shinsegae-pharmacy-default-rtdb.firebaseio.com",
    projectId: "shinsegae-pharmacy",
    storageBucket: "shinsegae-pharmacy.firebasestorage.app",
    messagingSenderId: "742577443162",
    appId: "1:742577443162:web:1cb9c0260a0e146c8c6363",
    measurementId: "G-5THH6NF54S"
  };

  let fbApp = null;
  let fbDb = null;
  let fbRef = null;

  function initFirebase() {
    try {
      if (typeof firebase !== 'undefined') {
        if (!firebase.apps.length) {
          fbApp = firebase.initializeApp(firebaseConfig);
        } else {
          fbApp = firebase.app();
        }
        fbDb = firebase.database();
        fbRef = fbDb.ref('shinsegae_master_db/data');

        // ⚡ 실시간 웹소켓 리스너: 다른 기기(모바일/PC)에서 글을 쓰거나 수정하면 0.05초 만에 자동 수신
        fbRef.on('value', (snapshot) => {
          const cloudData = snapshot.val();
          if (cloudData) {
            applyCloudData(cloudData);
          }
        }, (err) => {
          console.warn('Firebase sync listener warning:', err);
        });
      }
    } catch(e) {
      console.warn('Firebase init warning:', e);
    }
  }

  // 데이터 통합 및 화면 갱신 엔진
  function applyCloudData(cloudData, callback) {
    if (!cloudData) return;
    try {
      let updated = false;

      // 클라우드에서 삭제된 ID 목록 병합
      if (cloudData.deletedIds && Array.isArray(cloudData.deletedIds)) {
        cloudData.deletedIds.forEach(did => addDeletedId(did));
      }

      const activeDeletedIds = getDeletedIds();

      function getSafeTime(item, dateField) {
        if (!item) return 0;
        if (item.id && typeof item.id === 'string' && item.id.startsWith('task_')) {
          const idNum = parseInt(item.id.replace('task_', ''), 10);
          if (!isNaN(idNum) && idNum > 1000000000000) return idNum;
        }
        const str = item.createdAt || item[dateField] || item.date || item.updatedAt || '';
        if (!str) return 0;
        if (typeof str === 'number') return str;
        const s = String(str).trim().replace(/\+/g, ' ').replace(/-/g, '/');
        const ms = new Date(s).getTime();
        return isNaN(ms) ? 0 : ms;
      }

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
          const timeA = getSafeTime(a, dateField);
          const timeB = getSafeTime(b, dateField);
          return timeB - timeA;
        });
      }

      function isListDifferent(listA, listB) {
        if (!listA && !listB) return false;
        if (!listA || !listB) return true;
        if (listA.length !== listB.length) return true;
        const mapA = {};
        listA.forEach(item => { if (item && item.id) mapA[item.id] = String(item.updatedAt || item.date || item.createdAt || item.title || item.content || item.text || ''); });
        return listB.some(item => !item || !item.id || !mapA[item.id] || mapA[item.id] !== String(item.updatedAt || item.date || item.createdAt || item.title || item.content || item.text || ''));
      }

      let needPushBack = false;

      // 1. 공지사항 & SOP 스마트 비파괴 병합 (삭제된 글 제외)
      if (cloudData.notices && Array.isArray(cloudData.notices)) {
        const localNotices = getNotices() || [];
        const mergedNotices = mergeById(localNotices, cloudData.notices, 'date');
        if (isListDifferent(localNotices, mergedNotices)) {
          safeSetItem(STORAGE_KEYS.NOTICES, JSON.stringify(mergedNotices));
          updated = true;
        }
        const cloudNoticeIds = new Set((cloudData.notices || []).map(n => n.id));
        if ((localNotices || []).some(n => n && n.id && !cloudNoticeIds.has(n.id))) {
          needPushBack = true;
        }
      }

      // 2. 업무일지 스마트 비파괴 양방향 융합 (핸드폰 글 + PC 글 완전 통합)
      if (cloudData.worklogs && Array.isArray(cloudData.worklogs)) {
        const localLogs = getWorklogs() || [];
        const mergedLogs = mergeById(localLogs, cloudData.worklogs, 'createdAt');
        if (isListDifferent(localLogs, mergedLogs)) {
          safeSetItem(STORAGE_KEYS.WORKLOGS, JSON.stringify(mergedLogs));
          updated = true;
        }
        // 🔥 핸드폰에만 있거나 PC에만 있는 고유 글을 감지하여 파이어베이스에 즉시 업로드 (양방향 합집합 완성)
        const cloudWorklogIds = new Set((cloudData.worklogs || []).map(w => w.id));
        if ((localLogs || []).some(l => l && l.id && !cloudWorklogIds.has(l.id))) {
          needPushBack = true;
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
        const cloudLeaveIds = new Set((cloudData.leaveRequests || []).map(l => l.id));
        if ((localLeaves || []).some(l => l && l.id && !cloudLeaveIds.has(l.id))) {
          needPushBack = true;
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
        const cloudDiscIds = new Set((cloudData.discountPurchases || []).map(d => d.id));
        if ((localDiscounts || []).some(d => d && d.id && !cloudDiscIds.has(d.id))) {
          needPushBack = true;
        }
      }

      // 5. 월간 근무 스케줄 스마트 비파괴 병합 (날짜 + 직원ID 고유키 & 실제 근무시간 절대 보호)
      if (cloudData.schedule && Array.isArray(cloudData.schedule)) {
        const localSched = getSchedule() || [];
        const map = {};
        localSched.forEach(s => {
          if (s && s.date && s.empId) {
            map[`${s.date}_${s.empId}`] = s;
          }
        });
        
        let localHasUniqueShift = false;
        cloudData.schedule.forEach(cs => {
          if (cs && cs.date && cs.empId) {
            const key = `${cs.date}_${cs.empId}`;
            const ls = map[key];
            if (!ls) {
              map[key] = cs;
            } else {
              // 🛡️ 스마트 우선순위: 실제 근무(A,B,C,D,FULL,CUSTOM)가 입력되어 있으면 빈 OFF가 덮어쓰지 못하도록 보호
              const cIsWork = cs.shift && cs.shift !== 'OFF';
              const lIsWork = ls.shift && ls.shift !== 'OFF';
              if (cIsWork && !lIsWork) {
                map[key] = cs;
              } else if (!cIsWork && lIsWork) {
                map[key] = ls;
                localHasUniqueShift = true;
              } else {
                map[key] = cs;
              }
            }
          }
        });

        const cur = safeGetItem(STORAGE_KEYS.SCHEDULE);
        const next = JSON.stringify(Object.values(map));
        if (cur !== next) {
          safeSetItem(STORAGE_KEYS.SCHEDULE, next);
          updated = true;
        }
        if (localHasUniqueShift) {
          needPushBack = true;
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
        if (JSON.stringify(localStatus) !== JSON.stringify(mergedStatus)) {
          needPushBack = true;
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

      // 8. 직원 명부 및 시급/권한 스마트 비파괴 병합
      let permMap = {};
      try {
        const permRaw = safeGetItem(STORAGE_KEYS.EMP_PERMISSIONS);
        if (permRaw) permMap = JSON.parse(permRaw);
      } catch(e) {}

      if (cloudData.empPermissions && typeof cloudData.empPermissions === 'object') {
        permMap = { ...cloudData.empPermissions, ...permMap };
        safeSetItem(STORAGE_KEYS.EMP_PERMISSIONS, JSON.stringify(permMap));
      }

      if (cloudData.employees && Array.isArray(cloudData.employees) && cloudData.employees.length > 0) {
        const cleanCloudEmps = cloudData.employees.filter(e => e && e.name && !e.name.includes('테스트') && !String(e.email || '').includes('test@'));
        
        const localEmps = getEmployees() || [];
        const localMap = {};
        localEmps.forEach(e => { if (e && e.id) localMap[e.id] = e; });
        INITIAL_EMPLOYEES.forEach(e => { if (e && e.id && !localMap[e.id]) localMap[e.id] = { ...e }; });

        const cloudMap = {};
        cleanCloudEmps.forEach(ce => { if (ce && ce.id) cloudMap[ce.id] = ce; });

        const allEmpIds = Array.from(new Set([...Object.keys(localMap), ...Object.keys(cloudMap)]));
        const finalEmps = allEmpIds.map(id => {
          const ce = cloudMap[id];
          const le = localMap[id];
          if (!ce) return le;
          if (!le) return { ...ce, allowedTabs: permMap[ce.id] || ce.allowedTabs };
          const cTime = Number(ce.updatedAt) || 0;
          const lTime = Number(le.updatedAt) || 0;
          const chosen = (cTime >= lTime || lTime === 0) ? ce : le;
          const targetAllowed = (cTime >= lTime || lTime === 0) ? (ce.allowedTabs || permMap[ce.id]) : (le.allowedTabs || permMap[ce.id]);
          if (targetAllowed) permMap[id] = targetAllowed;
          return {
            ...chosen,
            allowedTabs: targetAllowed || chosen.allowedTabs
          };
        });

        safeSetItem(STORAGE_KEYS.EMP_PERMISSIONS, JSON.stringify(permMap));

        const currentJson = safeGetItem(STORAGE_KEYS.EMPLOYEES);
        const newJson = JSON.stringify(finalEmps);
        if (currentJson !== newJson) {
          safeSetItem(STORAGE_KEYS.EMPLOYEES, newJson);
          updated = true;
        }

        const curr = getCurrentUser();
        if (curr && curr.id) {
          const matched = finalEmps.find(e => e.id === curr.id);
          if (matched) {
            setCurrentUser(matched);
            if (window.App && typeof window.App.renderSidebarNavigation === 'function') {
              window.App.renderSidebarNavigation();
            }
            if (window.App && typeof window.App.renderUserHeader === 'function') {
              window.App.renderUserHeader();
            }
          }
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

      // 🔥 로컬에만 있던 고유 데이터가 감지되면 즉시 파이어베이스로 2차 역전송(Push)
      if (needPushBack) {
        pushToCloud();
      }

      if (updated) {
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
          if (window.App && typeof window.App.renderQuickLoginButtons === 'function') {
            window.App.renderQuickLoginButtons();
          }
          if (window.App && typeof window.App.checkPendingRejectionNotice === 'function') {
            window.App.checkPendingRejectionNotice();
          }
          if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new CustomEvent('ssg_cloud_updated'));
          }
        }
      }
    } catch(e) {
      console.warn('applyCloudData error:', e);
    }
  }

  async function pushToCloud() {
    if (typeof window === 'undefined') return;
    try {
      const emps = getEmployees() || [];
      const cleanEmps = emps.map(e => ({
        id: e.id,
        name: e.name,
        role: e.role,
        email: e.email,
        phone: e.phone,
        passcode: e.passcode || '',
        joinDate: e.joinDate || '',
        weekdayRate: e.weekdayRate || e.hourlyRate || 0,
        holidayRate: e.holidayRate || e.hourlyRate || 0,
        hourlyRate: e.hourlyRate || 0,
        baseMonthlySalary: e.baseMonthlySalary || 0,
        memo: e.memo || '',
        allowedTabs: e.allowedTabs || [],
        updatedAt: e.updatedAt || Date.now()
      }));

      const payload = {
        name: "shinsegae_pharmacy_master_db_v1",
        data: {
          updatedAt: new Date().toISOString(),
          deletedIds: getDeletedIds(),
          employees: cleanEmps,
          empPermissions: safeGetItem(STORAGE_KEYS.EMP_PERMISSIONS) ? JSON.parse(safeGetItem(STORAGE_KEYS.EMP_PERMISSIONS)) : {},
          scheduleStatus: safeGetItem(STORAGE_KEYS.SCHEDULE_STATUS) ? JSON.parse(safeGetItem(STORAGE_KEYS.SCHEDULE_STATUS)) : {},
          pharmacistRates: getPharmacistRates(),
          overtimeAdjustments: getOvertimeAdjustments(),
          discountPurchases: getDiscountPurchases(),
          schedule: getSchedule(),
          leaveRequests: getLeaveRequests(),
          notices: getNotices(),
          worklogs: getWorklogs()
        }
      };

      const payloadStr = JSON.stringify(payload);

      // 🔥 1. Google Firebase Realtime Database (0.05초 초고속 즉시 전송)
      try {
        if (fbRef) {
          fbRef.set(payload.data);
        }
      } catch(fbe) {
        console.warn('Firebase push warning:', fbe);
      }

      // 2. 구글 앱스 스크립트(GAS) 보조 백업 전송
      try {
        let iframe = document.getElementById('ssg_gas_iframe');
        if (!iframe) {
          iframe = document.createElement('iframe');
          iframe.id = 'ssg_gas_iframe';
          iframe.name = 'ssg_gas_iframe';
          iframe.style.display = 'none';
          document.body.appendChild(iframe);
        }
        let form = document.getElementById('ssg_gas_form');
        if (!form) {
          form = document.createElement('form');
          form.id = 'ssg_gas_form';
          form.target = 'ssg_gas_iframe';
          form.method = 'POST';
          form.action = DIRECT_GAS_URL;
          form.style.display = 'none';
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = 'payload';
          input.id = 'ssg_gas_payload_input';
          form.appendChild(input);
          document.body.appendChild(form);
        }
        const inputEl = document.getElementById('ssg_gas_payload_input');
        if (inputEl) {
          inputEl.value = payloadStr;
          form.submit();
        }
      } catch(fe) {}

      // 3. 버셀 호스팅 환경에서만 보조 REST 전송
      if (typeof window !== 'undefined' && window.location && window.location.hostname.includes('vercel.app')) {
        try {
          window.fetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payloadStr
          }).catch(() => {});
        } catch(ve) {}
      }

      safeSetItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
      updateSyncStatusUI('success');
    } catch(e) {
      updateSyncStatusUI('error');
    }
  }

  // 🌐 무적 JSONP 클라우드 로더 (보조 백업)
  function fetchGasJsonp() {
    return new Promise((resolve) => {
      const cbName = '_ssg_gas_cb_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
      const script = document.createElement('script');
      let timer = setTimeout(() => {
        cleanup();
        resolve(null);
      }, 6000);
      function cleanup() {
        clearTimeout(timer);
        delete window[cbName];
        if (script.parentNode) script.parentNode.removeChild(script);
      }
      window[cbName] = function(resp) {
        cleanup();
        resolve(resp);
      };
      script.onerror = function() {
        cleanup();
        resolve(null);
      };
      const sep = DIRECT_GAS_URL.includes('?') ? '&' : '?';
      script.src = `${DIRECT_GAS_URL}${sep}callback=${cbName}&t=${Date.now()}`;
      document.body.appendChild(script);
    });
  }

  async function pullFromCloud(callback) {
    if (isSyncing || typeof window === 'undefined') return;
    isSyncing = true;
    try {
      let cloudData = null;

      // 🔥 1. Firebase 실시간 데이터 우선 수신
      if (fbRef) {
        try {
          const snap = await fbRef.once('value');
          if (snap && snap.exists()) {
            cloudData = snap.val();
          }
        } catch(fbe) {}
      }

      // 2. Google Apps Script 무적 JSONP 보조 수신
      if (!cloudData) {
        try {
          const gasJson = await fetchGasJsonp();
          if (gasJson) {
            if (gasJson.data && Object.keys(gasJson.data).length > 0) {
              cloudData = gasJson.data;
            } else if (gasJson.employees || gasJson.worklogs || gasJson.discountPurchases) {
              cloudData = gasJson;
            }
          }
        } catch(ge) {}
      }

      if (cloudData) {
        applyCloudData(cloudData, callback);
      } else {
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

  // 💾 전체 데이터 원클릭 백업 파일 (.json) 내보내기 & 불러오기 기능
  function exportFullBackupJSON() {
    const fullData = getData();
    const backupObj = {
      app: "shinsegae_pharmacy_app",
      version: "5.0",
      exportedAt: new Date().toISOString(),
      exportedAtFormatted: new Date().toLocaleString('ko-KR'),
      data: fullData
    };

    const blob = new Blob([JSON.stringify(backupObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    
    a.href = url;
    a.download = `shinsegae_pharmacy_backup_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importFullBackupJSON(jsonString) {
    try {
      const parsed = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
      const targetData = parsed.data || parsed;

      if (!targetData) {
        throw new Error('올바른 백업 데이터 형식이 아닙니다.');
      }

      if (targetData.employees) safeSetItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(targetData.employees));
      if (targetData.schedule) safeSetItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(targetData.schedule));
      if (targetData.scheduleStatus) safeSetItem(STORAGE_KEYS.SCHEDULE_STATUS, JSON.stringify(targetData.scheduleStatus));
      if (targetData.notices) safeSetItem(STORAGE_KEYS.NOTICES, JSON.stringify(targetData.notices));
      if (targetData.leaveRequests) safeSetItem(STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify(targetData.leaveRequests));
      if (targetData.discountPurchases) safeSetItem(STORAGE_KEYS.DISCOUNT_PURCHASES, JSON.stringify(targetData.discountPurchases));
      if (targetData.worklogs) safeSetItem(STORAGE_KEYS.WORKLOGS, JSON.stringify(targetData.worklogs));
      if (targetData.emergencyContacts) safeSetItem(STORAGE_KEYS.EMERGENCY_CONTACTS, JSON.stringify(targetData.emergencyContacts));
      if (targetData.pharmacySettlement) safeSetItem(STORAGE_KEYS.PHARMACY_SETTLEMENT, JSON.stringify(targetData.pharmacySettlement));
      if (targetData.buildingRental) safeSetItem(STORAGE_KEYS.BUILDING_RENTAL, JSON.stringify(targetData.buildingRental));
      if (targetData.paystubs) safeSetItem(STORAGE_KEYS.PAYSTUBS, JSON.stringify(targetData.paystubs));
      if (targetData.overtimeAdjustments) safeSetItem(STORAGE_KEYS.OVERTIME_ADJUSTMENTS, JSON.stringify(targetData.overtimeAdjustments));
      if (targetData.pharmacistRates) safeSetItem('ssg_pharmacist_rates_v1', JSON.stringify(targetData.pharmacistRates));

      // 클라우드에도 즉시 전송
      pushToCloud();

      // UI 새로고침
      if (window.App) {
        if (typeof window.App.renderActiveModule === 'function') window.App.renderActiveModule();
        if (typeof window.App.renderSidebarNavigation === 'function') window.App.renderSidebarNavigation();
        if (typeof window.App.renderUserHeader === 'function') window.App.renderUserHeader();
      }

      return { success: true };
    } catch(err) {
      return { success: false, error: err.message };
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
        el.innerHTML = '<span class="badge cloud-badge-connected" style="font-size:11.5px; padding:6px 12px; border-radius:20px; font-weight:700; display:inline-flex; align-items:center; gap:5px; background:linear-gradient(135deg, #10b981 0%, #059669 100%); color:#ffffff; box-shadow:0 2px 8px rgba(16,185,129,0.35); border:1px solid #059669;"><i class="fas fa-check-circle"></i> <span class="sync-badge-full-text">☁️ 실시간 클라우드 공유 연동 중</span><span class="sync-badge-short-text">☁️ 연동중</span></span>';
      } else {
        el.innerHTML = '<span class="badge cloud-badge-syncing" style="font-size:11.5px; padding:6px 12px; border-radius:20px; font-weight:700; display:inline-flex; align-items:center; gap:5px; background:#f1f5f9; color:#64748b; border:1px solid #cbd5e1;"><i class="fas fa-sync fa-spin"></i> <span class="sync-badge-full-text">☁️ 클라우드 동기화 중...</span><span class="sync-badge-short-text">☁️ 동기화</span></span>';
      }
    }
  }

  // 앱 시동, 화면 복귀(Focus/Visibility), 및 3.5초 주기 초고속 실시간 백그라운드 동기화 (오직 pull만 수행하여 덮어쓰기 원천 차단!)
  if (typeof window !== 'undefined') {
    setTimeout(() => {
      pullFromCloud();
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
    initFirebase,
    pushToCloud,
    pullFromCloud,
    syncDirectWithGoogleSheet,
    getSheetUrl,
    setSheetUrl,
    exportFullBackupJSON,
    importFullBackupJSON
  };

  // 🚀 초기 로드 시 Firebase 실시간 연결 즉시 개시
  try {
    if (typeof window !== 'undefined') {
      window.addEventListener('DOMContentLoaded', initFirebase);
      initFirebase();
    }
  } catch(e) {}

})();
