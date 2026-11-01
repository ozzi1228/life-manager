// 사용자 시간대 기준 날짜(기본 서울, 05 §4.2: 칸 날짜는 기기가 아니라 사용자 설정 시간대)
/** 오늘 "YYYY-MM-DD" */
export const todayIn = (tz = "Asia/Seoul") => new Date().toLocaleDateString("sv-SE", { timeZone: tz });
