// 서버가 뜰 때 한 번(Next.js instrumentation): 예약 작업 시작(src/server/jobs.ts). OONA_JOBS=off면 끔
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.OONA_JOBS === "off") return;
  const { startScheduler } = await import("./server/jobs");
  startScheduler();
}
