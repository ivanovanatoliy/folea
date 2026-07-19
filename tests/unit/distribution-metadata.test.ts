import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const description = 'Keyboard-driven, minimalist note manager for Typst notes';
const read = (file: string): string => readFileSync(path.resolve(file), 'utf8');

describe('package metadata', () => {
  it('uses one package description everywhere', () => {
    const packageJson = JSON.parse(read('package.json')) as { description: string };
    expect(packageJson.description).toBe(description);

    for (const file of [
      'packaging/scoop/folea-dev.json.in',
      'packaging/homebrew/Formula/folea.rb',
      'packaging/homebrew/Casks/folea-dev.rb.in',
      'packaging/aur/PKGBUILD',
      'packaging/aur/.SRCINFO',
      'packaging/aur/folea.desktop',
      'scripts/install-unpacked.mjs'
    ]) {
      expect(read(file), file).toContain(description);
    }
  });

  it('ships a purpose-built multi-size Windows icon', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      build: {
        files: string[];
        mac: { icon: string };
        win: { icon: string };
        linux: { icon: string };
      };
    };
    expect(packageJson.build.win.icon).toBe('assets/logo/app-icon-windows.ico');
    expect(packageJson.build.files).toContain('assets/logo/app-icon-windows.ico');
    expect(packageJson.build.mac.icon).toBe('assets/logo/app-icon-dark.svg');
    expect(packageJson.build.linux.icon).toBe('assets/logo/app-icon-dark.svg');
    expect(read('assets/logo/app-icon-windows.svg')).toContain('scale(1.125)');

    const ico = readFileSync(path.resolve('assets/logo/app-icon-windows.ico'));
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    const count = ico.readUInt16LE(4);
    const sizes = Array.from({ length: count }, (_, index) => {
      const offset = 6 + index * 16;
      const width = ico[offset] || 256;
      const height = ico[offset + 1] || 256;
      const bytes = ico.readUInt32LE(offset + 8);
      const imageOffset = ico.readUInt32LE(offset + 12);
      expect(height).toBe(width);
      expect(ico.subarray(imageOffset, imageOffset + 8)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      );
      expect(imageOffset + bytes).toBeLessThanOrEqual(ico.length);
      return width;
    }).sort((a, b) => a - b);

    expect(sizes).toEqual([16, 20, 24, 32, 40, 48, 64, 96, 256]);
  });
});

describe('release workflow', () => {
  it('can only release the selected main commit manually', () => {
    const workflow = read('.github/workflows/release.yml');
    const triggers = workflow.slice(workflow.indexOf('on:'), workflow.indexOf('concurrency:'));

    expect(triggers).toContain('workflow_dispatch:');
    expect(triggers).toContain('version:');
    expect(triggers).toContain('required: true');
    expect(triggers).not.toMatch(/^\s+(push|pull_request|schedule|release|workflow_run):/m);
    expect(workflow).toContain('refs/heads/main');
    expect(workflow).toContain('release_sha=${GITHUB_SHA}');
    expect(workflow).toContain('ref: ${{ needs.prepare.outputs.release_sha }}');
    expect(workflow).toContain('--target "$RELEASE_SHA"');
    expect(workflow).not.toMatch(/PACKAGING_REPOS_TOKEN|deploy-pages|npm publish|--publish always/);
  });

  it('keeps every non-release workflow off main', () => {
    for (const name of readdirSync(path.resolve('.github/workflows'))) {
      const workflow = read(path.join('.github/workflows', name));
      expect(workflow, name).not.toMatch(/branches:\s*(?:\n\s*-\s*main|\[main\])/);
    }

    expect(read('.github/workflows/develop-packaging.yml')).toContain(
      '[[ "$GITHUB_REF" == refs/heads/develop ]]'
    );
    expect(read('.github/workflows/performance.yml')).toContain(
      "if: github.ref == 'refs/heads/develop'"
    );
  });
});
