import fs from "node:fs";
import path from "node:path";

export function readInput(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), "inputs", name), "utf8");
}
