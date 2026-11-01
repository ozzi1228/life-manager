import { drizzle } from "drizzle-orm/node-postgres";
import { pool } from "../lib/db.ts";
import * as schema from "./schema.ts";

export const db = drizzle(pool, { schema });
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
