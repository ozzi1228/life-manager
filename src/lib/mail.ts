// 메일 보내기(비밀번호 찾기). SMTP 설정(.env)이 있을 때만 — 예: Gmail 앱 비밀번호(smtp.gmail.com:465)
// 설정이 없으면 보내지 않고 서버 로그에만 남김
import nodemailer from "nodemailer";

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;
export const mailReady = !!(SMTP_HOST && SMTP_USER && SMTP_PASS);

const transport = mailReady
  ? nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT || 465), secure: Number(SMTP_PORT || 465) === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } })
  : null;

export async function sendMail(to: string, subject: string, text: string) {
  if (!transport) return console.warn("[mail] SMTP 설정이 없어 메일을 보내지 않았어요:", subject);
  await transport.sendMail({ from: MAIL_FROM || `우나 <${SMTP_USER}>`, to, subject, text });
}
