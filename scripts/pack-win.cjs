const { spawnSync } = require("node:child_process");

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = `release/build-${stamp}`;

const args = [
  "electron-builder",
  "--win",
  "nsis",
  `--config.directories.output=${outputDir}`,
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
    ELECTRON_BUILDER_ALLOW_UNRESOLVED_DEPENDENCIES: "true",
  },
});

if (run.error) {
  throw run.error;
}

process.exit(run.status ?? 1);
