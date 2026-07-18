import { readFileSync, writeFileSync } from 'node:fs';

const values = {
  __VERSION__: process.env.FOLEA_VERSION,
  __FULL_SHA__: process.env.FOLEA_COMMIT_SHA,
  __ARCHIVE_SHA256__: process.env.FOLEA_ARCHIVE_SHA256,
  __COMMIT_COUNT__: process.env.FOLEA_COMMIT_COUNT,
  __TIMESTAMP__: process.env.FOLEA_BUILD_TIMESTAMP,
  __WORKFLOW_RUN_URL__: process.env.FOLEA_WORKFLOW_RUN_URL
};

for (const [name, value] of Object.entries(values)) {
  if (!value) throw new Error(`Missing value for ${name}`);
}

let cask = readFileSync('packaging/homebrew/Casks/folea-dev.rb.in', 'utf8');
for (const [name, value] of Object.entries(values)) cask = cask.replaceAll(name, value);
writeFileSync(process.argv[2] || 'folea-dev.rb', cask);
