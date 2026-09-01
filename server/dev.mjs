import { spawn } from "node:child_process";

let shuttingDown = false;

const vuepressArgs = [...process.argv.slice(2)];
const pnpm = process.env.PNPM || "pnpm";

const hasArg = (name) =>
  vuepressArgs.some(
    (arg) => arg === `--${name}` || arg.startsWith(`--${name}=`),
  );

if (!hasArg("host")) vuepressArgs.push("--host", "127.0.0.1");
if (!hasArg("port")) vuepressArgs.push("--port", "8080");

const commands = [
  {
    name: "bookmarks-api",
    command: "node",
    args: ["server/index.mjs", "--api-only", "--port=3001"],
  },
  {
    name: "vuepress",
    command: pnpm,
    args: ["docs:dev", ...vuepressArgs],
  },
];

const children = commands.map(({ args, command, name }) => {
  const child = spawn(command, args, {
    env: process.env,
    stdio: ["inherit", "pipe", "pipe"],
  });

  const prefix = (chunk) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (line) process.stdout.write(`[${name}] ${line}\n`);
    }
  };

  child.stdout.on("data", prefix);
  child.stderr.on("data", prefix);
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;

    shuttingDown = true;
    stopChildren();
    process.exit(code ?? (signal ? 1 : 0));
  });

  return child;
});

const stopChildren = () => {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
};

const shutdown = () => {
  if (shuttingDown) return;

  shuttingDown = true;
  stopChildren();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
