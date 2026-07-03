import { defineConfig } from 'electron-vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
  main: {
    build: {
      externalizeDeps: true
    }
  },
  preload: {
    build: {
      externalizeDeps: false
    }
  },
  renderer: {
    plugins: [solid()]
  }
});
