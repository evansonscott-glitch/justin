import "./env";
import fs from "node:fs";
import { db } from "../src/lib/db";

const sql = fs.readFileSync("db/schema.sql", "utf8");
await db().query(sql);
console.log("Schema applied.");
await db().end();
