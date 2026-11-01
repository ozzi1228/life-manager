// 모든 사용자 데이터 테이블의 공통 열 (docs/planning/14 §1.1)
// 쓰는 법: pgTable("goals", { ...userData(), name: text("name").notNull() })
import { integer, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "./id.ts";

const at = (name: string) => timestamp(name, { withTimezone: true });

export const userData = () => ({
  id: uuid("id").primaryKey().$defaultFn(uuidv7),
  // Better Auth 사용자 id(text). 서비스 계층이 세션 사용자로만 채움(요청 값을 믿지 않음)
  userId: text("user_id").notNull(),
  createdAt: at("created_at").notNull().defaultNow(),
  updatedAt: at("updated_at").notNull().defaultNow(),
  deletedAt: at("deleted_at"),
  deletedBy: text("deleted_by"),
  deleteBatchId: uuid("delete_batch_id"),
  version: integer("version").notNull().default(1),
  source: text("source").notNull().default("manual"),
});

export { at };
