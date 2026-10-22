import path from "path";
import dotenv from "dotenv";

const repoRoot = path.resolve(__dirname, "../../..");
dotenv.config({ path: path.join(repoRoot, ".env") });

export const dbEnv = {
  DB_DIR: process.env.DB_DIR || "./.db",
  DB_FILE: process.env.DB_FILE || "puppy-track.sqlite",
  repoRoot,
};
