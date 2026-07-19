import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const envOrGit = (name, args) => process.env[name] || git(...args);

export const createDevelopmentMetadata = ({
  sha,
  timestamp,
  commitCount,
  branch = 'develop',
  runUrl = 'local',
  nodeVersion = process.version,
  electronVersion
}) => {
  if (!/^[0-9a-f]{40}$/i.test(sha)) throw new Error('FOLEA_COMMIT_SHA must be a full Git SHA');
  if (!/^\d{14}$/.test(timestamp)) {
    throw new Error('FOLEA_BUILD_TIMESTAMP must be YYYYMMDDHHMMSS in UTC');
  }
  if (!/^\d+$/.test(String(commitCount))) throw new Error('FOLEA_COMMIT_COUNT must be numeric');

  const fullSha = sha.toLowerCase();
  const shortSha = fullSha.slice(0, 7);
  const count = String(commitCount).padStart(8, '0');
  const version = `0.0.0-git.${timestamp}.c${count}.${shortSha}`;
  const buildInfo = [
    `SOURCE_COMMIT=${fullSha}`,
    `SOURCE_COMMIT_SHORT=${shortSha}`,
    `SOURCE_BRANCH=${branch}`,
    `BUILD_TIMESTAMP_UTC=${timestamp}`,
    `GIT_COMMIT_COUNT=${commitCount}`,
    `WORKFLOW_RUN_URL=${runUrl}`,
    `NODE_VERSION=${nodeVersion}`,
    `ELECTRON_VERSION=${electronVersion}`,
    ''
  ].join('\n');

  return { version, buildInfo, fullSha, shortSha };
};

export const prepareDevelopmentBuild = () => {
  const now = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  const metadata = createDevelopmentMetadata({
    sha: envOrGit('FOLEA_COMMIT_SHA', ['rev-parse', 'HEAD']),
    timestamp: process.env.FOLEA_BUILD_TIMESTAMP || now,
    commitCount: envOrGit('FOLEA_COMMIT_COUNT', ['rev-list', '--count', 'HEAD']),
    branch: process.env.FOLEA_SOURCE_BRANCH || 'develop',
    runUrl: process.env.FOLEA_WORKFLOW_RUN_URL || 'local',
    electronVersion: packageJson.devDependencies.electron
  });

  writeFileSync('packaging/build-info', metadata.buildInfo);
  return metadata;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${prepareDevelopmentBuild().version}\n`);
}
