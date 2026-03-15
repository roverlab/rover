const { spawnSync } = require("node:child_process");

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = `release/build-${stamp}`;

console.log('Building without code signing...');

const args = [
  "electron-builder",
  "--win",
  "--x64",
  "--config.nsis.oneClick=false",
  "--config.nsis.allowToChangeInstallationDirectory=true",
  "--config.directories.output=" + outputDir,
  "--publish=never",
];

const run = spawnSync("npx", args, {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    CSC_LINK: "",
    CSC_KEY_PASSWORD: "",
    CSC_NAME: "",
    CSC_IDENTITY: "",
  },
});

if (run.error) {
  throw run.error;
}

process.exit(run.status ?? 1);
