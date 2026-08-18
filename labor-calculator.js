/**
 * 대한민국 근로기준법 및 365메가스타약국 전용 근로계약서 기준 급여 정산 엔진
 * 1. 근무약사: 스케줄 변동형 포괄시급제 (약정시급, 기본시급 83.3%, 주휴분 16.7%, 주15시간 이상 여부 판단)
 * 2. 일반직원: 고정 월급제 (209시간 기준, 기본급 + 식대 20만원 비과세 분리)
 */
window.LaborCalculator = (function () {

  const HOLIDAYS_2026 = {
    '2026-01-01': '신정',
    '2026-02-16': '설날 연휴',
    '2026-02-17': '설날',
    '2026-02-18': '설날 연휴',
    '2026-03-01': '삼일절',
    '2026-03-02': '삼일절 대체공휴일',
    '2026-05-05': '어린이날',
    '2026-05-24': '부처님오신날',
    '2026-05-25': '부처님오신날 대체공휴일',
    '2026-06-06': '현충일',
    '2026-08-15': '광복절',
    '2026-08-17': '광복절 대체공휴일',
    '2026-09-24': '추석 연휴',
    '2026-09-25': '추석',
    '2026-09-26': '추석 연휴',
    '2026-10-03': '개천절',
    '2026-10-05': '개천절 대체공휴일',
    '2026-10-09': '한글날',
    '2026-12-25': '성탄절'
  };

  /**
   * 실근로시간 계산 (휴게시간 세부 조정 가능)
   */
  function calculateShiftNetHours(startTimeStr, endTimeStr, shiftCode, customBreakHours = 1.0) {
    if (shiftCode === 'OFF' || shiftCode === 'LEAVE') return 0;

    let start = startTimeStr;
    let end = endTimeStr;

    if (!start || !end) {
      if (shiftCode === 'A') { start = '09:00'; end = '18:00'; }
      else if (shiftCode === 'B') { start = '10:00'; end = '22:00'; }
      else if (shiftCode === 'C') { start = '09:00'; end = '13:00'; }
      else if (shiftCode === 'D') { start = '13:00'; end = '22:00'; }
      else if (shiftCode === 'FULL') { start = '09:00'; end = '22:00'; }
      else return 0;
    }

    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);

    let startMin = sh * 60 + sm;
    let endMin = eh * 60 + em;
    if (endMin < startMin) endMin += 24 * 60;

    let totalSpanMin = endMin - startMin;
    let totalSpanHours = totalSpanMin / 60;

    // 설정된 약국 휴게시간 차감 (기본 1.0시간, 0.5시간, 1.5시간 등 지정 가능)
    const breakHours = (customBreakHours !== undefined && customBreakHours !== null && !isNaN(customBreakHours)) ? Number(customBreakHours) : 1.0;
    let netWorkingHours = Math.max(0, totalSpanHours - breakHours);
    return Math.round(netWorkingHours * 10) / 10;
  }

  function getDateMultiplierInfo(dateStr) {
    const d = new Date(dateStr);
    const dayOfWeek = d.getDay();
    const isHoliday = (dayOfWeek === 0 || dayOfWeek === 6 || !!HOLIDAYS_2026[dateStr]);

    let label = '평일';
    if (HOLIDAYS_2026[dateStr]) {
      label = `공휴일 (${HOLIDAYS_2026[dateStr]})`;
    } else if (dayOfWeek === 0) {
      label = '일요일';
    } else if (dayOfWeek === 6) {
      label = '토요일';
    }

    return {
      isHoliday,
      multiplier: 1.0, // 근로계약서 제4조/제5조에 따라 공휴일 1:1 유급대체 적용
      label
    };
  }

  /**
   * 근무약사 급여 산정 엔진 (평일 시급 vs 주말/토/일/공휴일/대체휴일 시급 차등 적용 및 휴게시간 개별 지정)
   */
  function calculatePharmacistPayroll(empShifts, weekdayRate = 35000, holidayRate = 40000, customBreakHours = 1.0) {
    let totalNetHours = 0;
    let weekdayNetHours = 0;
    let holidayNetHours = 0;

    let totalWorkDays = 0;
    let weekdayWorkDays = 0;
    let holidayWorkDays = 0;

    const rateWeekday = Number(weekdayRate) || 35000;
    const rateHoliday = Number(holidayRate) || (rateWeekday > 35000 ? rateWeekday : 40000);
    const breakHours = (customBreakHours !== undefined && customBreakHours !== null && !isNaN(customBreakHours)) ? Number(customBreakHours) : 1.0;

    empShifts.forEach(item => {
      const shiftCode = item.shift || 'OFF';
      if (shiftCode !== 'OFF' && shiftCode !== 'LEAVE') {
        const shiftBreak = (item.breakHours !== undefined && item.breakHours !== null && !isNaN(item.breakHours)) ? Number(item.breakHours) : breakHours;
        const netHours = calculateShiftNetHours(item.startTime, item.endTime, shiftCode, shiftBreak);
        if (netHours > 0) {
          totalWorkDays++;

          const dateInfo = getDateMultiplierInfo(item.date);
          if (dateInfo.isHoliday) {
            holidayWorkDays++;
            holidayNetHours += netHours;
          } else {
            weekdayWorkDays++;
            weekdayNetHours += netHours;
          }
        }
      }
    });

    weekdayNetHours = Math.round(weekdayNetHours * 10) / 10;
    holidayNetHours = Math.round(holidayNetHours * 10) / 10;
    totalNetHours = Math.round((weekdayNetHours + holidayNetHours) * 10) / 10;

    const weekdayPay = Math.round(weekdayNetHours * rateWeekday);
    const holidayPay = Math.round(holidayNetHours * rateHoliday);
    const totalPayroll = weekdayPay + holidayPay;

    const baseAmount = Math.round(totalPayroll * 0.833);
    const holidayAllowanceAmount = totalPayroll - baseAmount;

    return {
      weekdayRate: rateWeekday,
      holidayRate: rateHoliday,
      customBreakHours: breakHours,
      totalNetHours,
      weekdayNetHours,
      holidayNetHours,
      totalWorkDays,
      weekdayWorkDays,
      holidayWorkDays,
      weekdayPay,
      holidayPay,
      baseAmount,
      holidayAllowanceAmount,
      totalPayroll
    };
  }

  /**
   * 일반직원 급여 산정 엔진 (월급제 - 계약서 제6조)
   * 기준시급 11,000원 기준 209시간 (소정 173h + 주휴 36h) 적용 -> 월 2,299,000원
   * (기본급 2,099,000원 + 비과세 식대 200,000원)
   */
  function calculateStaffPayroll(empShifts, baseRate = 11000) {
    let totalNetHours = 0;
    let totalWorkDays = 0;

    empShifts.forEach(item => {
      const shiftCode = item.shift || 'OFF';
      if (shiftCode !== 'OFF' && shiftCode !== 'LEAVE') {
        const shiftBreak = (item.breakHours !== undefined && item.breakHours !== null && !isNaN(item.breakHours)) ? Number(item.breakHours) : 1.0;
        const netHours = calculateShiftNetHours(item.startTime, item.endTime, shiftCode, shiftBreak);
        if (netHours > 0) {
          totalWorkDays++;
          totalNetHours += netHours;
        }
      }
    });

    // 계약서 제6조 월 산정시간 209시간 적용
    const totalMonthlySalary = Math.round(baseRate * 209);
    const taxFreeMealAllowance = 200000; // 식대 20만 원 비과세
    const baseSalary = totalMonthlySalary - taxFreeMealAllowance;

    const avgWeeklyHours = Math.round((totalNetHours / 4.3) * 10) / 10;

    return {
      baseRate,
      totalNetHours,
      totalWorkDays,
      avgWeeklyHours,
      monthlyHours: 209,
      baseSalary,
      taxFreeMealAllowance,
      totalMonthlySalary
    };
  }

  /**
   * 근로기준법 제60조 연차 유급휴가 산정
   */
  function calculateStatutoryLeave(joinDateStr) {
    if (!joinDateStr) {
      return { totalGranted: 15, years: 1, months: 0, desc: '기본 15일 부여' };
    }

    const today = new Date();
    const joinDate = new Date(joinDateStr);

    let years = today.getFullYear() - joinDate.getFullYear();
    let months = today.getMonth() - joinDate.getMonth();

    if (months < 0 || (months === 0 && today.getDate() < joinDate.getDate())) {
      years--;
      months += 12;
    }

    const totalMonths = years * 12 + months;
    let totalGranted = 0;
    let desc = '';

    if (years < 1) {
      totalGranted = Math.min(11, totalMonths);
      desc = `1년 미만: 1개월 개근 시 1일 발생 (총 ${totalGranted}일)`;
    } else {
      const extraYears = Math.floor((years - 1) / 2);
      totalGranted = Math.min(25, 15 + extraYears);
      desc = `근속 ${years}년차: 법정 연차 ${totalGranted}일 부여`;
    }

    const tenureText = years > 0 ? `${years}년 ${months}개월` : `${months}개월`;
    const description = desc;

    return {
      totalGranted,
      years,
      months,
      totalMonths,
      desc,
      description,
      tenureText
    };
  }

  return {
    calculateShiftNetHours,
    getDateMultiplierInfo,
    calculatePharmacistPayroll,
    calculateStaffPayroll,
    calculateStatutoryLeave
  };
})();
