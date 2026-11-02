// 예전 주소(전체 목표는 /goals로 옮김, D-069)
import { redirect } from "next/navigation";

export default function GoalListRedirect() {
  redirect("/goals");
}
