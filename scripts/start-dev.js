import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const procs = [
  { name: "backend", color: "\x1b[36m", cmd: "npm", args: ["run", "dev", "-w", "@puppy-track/backend"] },
  { name: "frontend", color: "\x1b[35m", cmd: "npm", args: ["run", "dev", "-w", "@puppy-track/frontend"] },
];

const children = [];
let shuttingDown = false;

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill("SIGINT");
  process.exit(code ?? 0);
}

for (const p of procs) {
  const child = spawn(p.cmd, p.args, { cwd: root, shell: process.platform === "win32" });
  children.push(child);

  const prefix = `${p.color}[${p.name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) out.write(prefix + line + "\n");
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);

  child.on("exit", (code) => {
    process.stdout.write(prefix + `exited with code ${code}\n`);
    shutdown(code ?? 0);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
