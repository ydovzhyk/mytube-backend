const { spawn } = require("child_process");

function runCmd(command, args, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(command, args, { cwd, windowsHide: true });

    let stdout = "";
    let stderr = "";

    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.stderr.on("data", (d) => (stderr += d.toString()));

    p.on("error", reject);

    p.on("close", (code) => {
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error(`${command} exited with code ${code}\n${stderr || stdout}`));
    });
  });
}

module.exports = { runCmd };
