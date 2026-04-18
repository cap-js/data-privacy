const { spawn, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const INCIDENTS_DIR = path.join(__dirname, "..", "incidents-mgmt");
const SIDECAR_DIR = path.join(INCIDENTS_DIR, "mtx", "sidecar");
const ROOT_DIR = path.join(__dirname, "..", "..");

const ALICE = { username: "alice", password: "" }; // tenant t1, DPI roles

/**
 * Pack @cap-js/data-privacy and install in sidecar to avoid dual @sap/cds load.
 * Restores the original package.json afterward so the file: reference stays intact.
 */
function ensureSidecarPlugin() {
  const pkgPath = path.join(SIDECAR_DIR, "package.json");
  const originalPkg = fs.readFileSync(pkgPath, "utf-8");
  const tgz = execSync("npm pack --pack-destination /tmp", {
    cwd: ROOT_DIR,
    encoding: "utf-8"
  }).trim();
  execSync(`npm install /tmp/${tgz}`, {
    cwd: SIDECAR_DIR,
    encoding: "utf-8",
    stdio: "ignore"
  });
  fs.writeFileSync(pkgPath, originalPkg);
}

/**
 * Remove all db*.sqlite, db*.sqlite-shm and db*.sqlite-wal files from incidents-mgmt root.
 */
function cleanDbFiles() {
  for (const f of fs.readdirSync(INCIDENTS_DIR).filter((f) => /^db.*\.sqlite(-shm|-wal)?$/.test(f))) {
    fs.unlinkSync(path.join(INCIDENTS_DIR, f));
  }
}

/**
 * Start the MTX sidecar via `cds watch` on a random port.
 * Resolves with { proc, port } when the server is listening.
 */
function startSidecar() {
  return new Promise((resolve, reject) => {
    const proc = spawn("npx", ["cds", "watch", "--port", "0"], {
      cwd: SIDECAR_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, FORCE_COLOR: false, NODE_ENV: "development" }
    });

    let output = "";
    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error(`Sidecar failed to start within 30s.\nOutput: ${output}`));
    }, 30_000);

    proc.stdout.on("data", (data) => {
      output += data.toString();
      const match = output.match(/server listening on \{[^}]*url:\s*'http:\/\/localhost:(\d+)'/);
      if (match) {
        clearTimeout(timeout);
        resolve({ proc, port: Number(match[1]) });
      }
    });

    proc.stderr.on("data", (data) => {
      output += data.toString();
    });

    proc.on("exit", (code) => {
      clearTimeout(timeout);
      if (code !== null && code !== 0) {
        reject(new Error(`Sidecar exited with code ${code}.\nOutput: ${output}`));
      }
    });
  });
}

/**
 * Subscribe a tenant via the sidecar's SaaS Provisioning endpoint.
 */
async function subscribeTenant(tenant, port) {
  const res = await fetch(
    `http://localhost:${port}/-/cds/saas-provisioning/tenant/${tenant}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + Buffer.from("yves:").toString("base64")
      },
      body: JSON.stringify({
        subscribedTenantId: tenant,
        subscribedSubdomain: tenant
      })
    }
  );
  return res.status;
}

/**
 * Stop the sidecar process and clean up DB files.
 */
async function stopSidecar(proc) {
  if (proc && !proc.killed) {
    proc.kill();
    await new Promise((resolve) => proc.on("exit", resolve));
  }
  cleanDbFiles();
}

module.exports = {
  INCIDENTS_DIR,
  SIDECAR_DIR,
  ALICE,
  ensureSidecarPlugin,
  cleanDbFiles,
  startSidecar,
  subscribeTenant,
  stopSidecar
};
