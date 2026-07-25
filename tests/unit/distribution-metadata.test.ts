import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const description = 'Keyboard-driven, minimalist note manager for Typst notes';
const read = (file: string): string => readFileSync(path.resolve(file), 'utf8');
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const paeth = (left: number, up: number, upperLeft: number): number => {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  return upDistance <= upperLeftDistance ? up : upperLeft;
};

const readRgbaPngAlphaBounds = (
  png: Buffer,
  alphaThreshold = 16
): {
  left: number;
  top: number;
  right: number;
  bottom: number;
  opaqueCoverage: number;
} => {
  expect(png.subarray(0, 8)).toEqual(pngSignature);

  let width = 0;
  let height = 0;
  const imageData: Buffer[] = [];
  for (let offset = 8; offset < png.length; ) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect([...data.subarray(8, 13)]).toEqual([8, 6, 0, 0, 0]);
    } else if (type === 'IDAT') {
      imageData.push(data);
    }
    offset += length + 12;
  }

  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const filtered = inflateSync(Buffer.concat(imageData));
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0, inputOffset = 0; y < height; y += 1) {
    const filter = filtered[inputOffset]!;
    inputOffset += 1;
    for (let x = 0; x < stride; x += 1) {
      const raw = filtered[inputOffset + x]!;
      const left = x >= bytesPerPixel ? pixels[y * stride + x - bytesPerPixel]! : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x]! : 0;
      const upperLeft =
        y > 0 && x >= bytesPerPixel ? pixels[(y - 1) * stride + x - bytesPerPixel]! : 0;
      let value = raw;
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += Math.floor((left + up) / 2);
      else if (filter === 4) value += paeth(left, up, upperLeft);
      else expect(filter).toBe(0);
      pixels[y * stride + x] = value & 0xff;
    }
    inputOffset += stride;
  }

  let left = width;
  let top = height;
  let right = 0;
  let bottom = 0;
  let opaquePixels = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = pixels[y * stride + x * bytesPerPixel + 3]!;
      if (alpha >= 240) opaquePixels += 1;
      if (alpha < alphaThreshold) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + 1);
      bottom = Math.max(bottom, y + 1);
    }
  }

  return {
    left,
    top,
    right,
    bottom,
    opaqueCoverage: opaquePixels / (width * height)
  };
};

describe('package metadata', () => {
  it('uses lowercase folea as the application name on every platform', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      name: string;
      productName: string;
      desktopName: string;
      build: {
        productName: string;
        executableName: string;
        nsis: { shortcutName: string; uninstallDisplayName: string };
      };
    };

    expect(packageJson.name).toBe('folea');
    expect(packageJson.productName).toBe('folea');
    expect(packageJson.desktopName).toBe('folea');
    expect(packageJson.build.productName).toBe('folea');
    expect(packageJson.build.executableName).toBe('folea');
    expect(packageJson.build.nsis).toEqual({
      shortcutName: 'folea',
      uninstallDisplayName: 'folea'
    });
    expect(read('src/renderer/index.html')).toContain('<title>folea</title>');
    expect(read('packaging/aur/folea.desktop')).toContain('\nName=folea\n');
    expect(read('packaging/homebrew/Casks/folea-dev.rb.in')).toContain('name "folea"');
    expect(read('scripts/install-unpacked.mjs')).toContain("'Folea Dev.lnk'");
    expect(read('scripts/uninstall-unpacked.mjs')).toContain("'Folea Dev.lnk'");
  });

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

  it('keeps AUR source checksums in sync', () => {
    const desktopHash = createHash('sha256')
      .update(readFileSync(path.resolve('packaging/aur/folea.desktop')))
      .digest('hex');

    expect(read('packaging/aur/PKGBUILD')).toContain(`'${desktopHash}'`);
    expect(read('packaging/aur/.SRCINFO')).toContain(`sha256sums = ${desktopHash}`);
  });

  it('ships a visually full multi-size Windows icon', () => {
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
    expect(read('assets/logo/app-icon-windows.svg')).toContain('scale(1.5)');

    const ico = readFileSync(path.resolve('assets/logo/app-icon-windows.ico'));
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    const count = ico.readUInt16LE(4);
    let largestPng: Buffer | undefined;
    let taskbarPng: Buffer | undefined;
    const sizes = Array.from({ length: count }, (_, index) => {
      const offset = 6 + index * 16;
      const width = ico[offset] || 256;
      const height = ico[offset + 1] || 256;
      const bytes = ico.readUInt32LE(offset + 8);
      const imageOffset = ico.readUInt32LE(offset + 12);
      expect(height).toBe(width);
      expect(ico.subarray(imageOffset, imageOffset + 8)).toEqual(pngSignature);
      expect(imageOffset + bytes).toBeLessThanOrEqual(ico.length);
      if (width === 256) largestPng = ico.subarray(imageOffset, imageOffset + bytes);
      if (width === 24) taskbarPng = ico.subarray(imageOffset, imageOffset + bytes);
      return width;
    }).sort((a, b) => a - b);

    expect(sizes).toEqual([16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 256]);
    expect(largestPng).toBeDefined();
    const bounds = readRgbaPngAlphaBounds(largestPng!);
    expect(
      Math.max(bounds.left, bounds.top, 256 - bounds.right, 256 - bounds.bottom)
    ).toBeLessThanOrEqual(5);

    expect(taskbarPng).toBeDefined();
    const taskbar = readRgbaPngAlphaBounds(taskbarPng!);
    expect(taskbar).toMatchObject({ left: 0, top: 0, right: 24, bottom: 24 });
    expect(taskbar.opaqueCoverage).toBeGreaterThanOrEqual(0.99);
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
