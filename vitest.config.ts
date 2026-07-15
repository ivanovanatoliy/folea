import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      include: [
        'src/main/**/*.ts',
        'src/shared/**/*.ts',
        'src/renderer/app/*-model.ts',
        'src/renderer/input/**/*.ts',
        'src/renderer/nav/**/*.ts',
        'src/renderer/search/**/*.ts',
        'src/renderer/vault/**/*.ts',
        'src/workers/typst-compile/**/*.ts'
      ],
      exclude: ['src/main/index.ts', 'src/main/window.ts', '**/*.d.ts'],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 55,
        statements: 60
      }
    }
  }
});
