/**
 * Generate build.json with version information for the application
 * This script reads package.json version and sing-box version
 * and creates a build.json file in the resources directory
 */

const fs = require('node:fs');
const path = require('node:path');

function generateBuildInfo() {
    try {
        // Read package.json to get app version
        const packageJsonPath = path.join(__dirname, '..', 'package.json');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const appVersion = packageJson.version;

        // Get sing-box version from command line args or use default
        const singboxVersion = process.argv[2] || '1.12.16';

        // Get short SHA from command line args or use default
        const shortSha = process.argv[3] || 'local';

        // Get current timestamp
        const buildTime = new Date().toISOString();

        // Create build info object
        const buildInfo = {
            appVersion: appVersion,
            singboxVersion: singboxVersion,
            buildTime: buildTime,
            buildNumber: process.env.GITHUB_RUN_NUMBER || 'dev',
            commitSha: shortSha
        };

        // Ensure resources directory exists
        const resourcesPath = path.join(__dirname, '..', 'resources');
        if (!fs.existsSync(resourcesPath)) {
            fs.mkdirSync(resourcesPath, { recursive: true });
        }

        // Write build.json to resources directory
        const buildJsonPath = path.join(resourcesPath, 'build.json');
        fs.writeFileSync(buildJsonPath, JSON.stringify(buildInfo, null, 2));

        console.log('Generated build.json:');
        console.log(JSON.stringify(buildInfo, null, 2));

        return buildInfo;
    } catch (error) {
        console.error('Error generating build info:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    generateBuildInfo();
}

module.exports = { generateBuildInfo };