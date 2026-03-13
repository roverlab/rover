/**
 * 自动维护版本号并推送 tag 到远程
 *
 * 用法:
 *   node scripts/release-tag.cjs [patch|minor|major]   # 自动递增版本
 *   node scripts/release-tag.cjs 1.2.3                 # 指定版本号
 *
 * 默认 bump 类型为 patch
 * 会依次执行: 更新 package.json -> git add -> git commit -> git tag -> git push
 */

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..');
const pkgPath = path.join(projectRoot, 'package.json');

function parseVersion(ver) {
    const m = String(ver).match(/^(\d+)\.(\d+)\.(\d+)(?:-.*)?$/);
    if (!m) return null;
    return { major: +m[1], minor: +m[2], patch: +m[3] };
}

function bumpVersion(current, type) {
    const v = parseVersion(current);
    if (!v) return null;
    if (type === 'major') return `${v.major + 1}.0.0`;
    if (type === 'minor') return `${v.major}.${v.minor + 1}.0`;
    return `${v.major}.${v.minor}.${v.patch + 1}`;
}

function isValidVersion(ver) {
    return /^\d+\.\d+\.\d+$/.test(String(ver));
}

function main() {
    const arg = process.argv[2] || 'patch';
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const current = pkg.version;

    let newVersion;
    if (['patch', 'minor', 'major'].includes(arg)) {
        newVersion = bumpVersion(current, arg);
        if (!newVersion) {
            console.error('Invalid current version:', current);
            process.exit(1);
        }
    } else if (isValidVersion(arg)) {
        newVersion = arg;
    } else {
        console.error('Usage: node release-tag.cjs [patch|minor|major] | [x.y.z]');
        process.exit(1);
    }

    if (newVersion === current) {
        console.error('Version unchanged:', current);
        process.exit(1);
    }

    console.log(`Bumping version: ${current} -> ${newVersion}`);

    pkg.version = newVersion;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

    const tag = `v${newVersion}`;

    let status;
    try {
        status = execSync('git status --porcelain', { cwd: projectRoot, encoding: 'utf8' });
    } catch {
        console.error('Not a git repository');
        process.exit(1);
    }

    const otherChanges = status
        .trim()
        .split(/\n/)
        .filter((line) => line.trim() && !line.includes('package.json'));
    if (otherChanges.length > 0) {
        console.error('Please commit or stash other changes first:');
        otherChanges.forEach((l) => console.error(' ', l));
        process.exit(1);
    }

    execSync('git add package.json', { cwd: projectRoot, stdio: 'inherit' });
    execSync(`git commit -m "chore: release ${tag}"`, { cwd: projectRoot, stdio: 'inherit' });
    execSync(`git tag ${tag}`, { cwd: projectRoot, stdio: 'inherit' });
    execSync('git push origin HEAD', { cwd: projectRoot, stdio: 'inherit' });
    execSync(`git push origin ${tag}`, { cwd: projectRoot, stdio: 'inherit' });

    console.log(`\nReleased ${tag}`);
}

main();
