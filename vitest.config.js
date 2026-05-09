import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['js/**/*.{test,spec}.js'],
    globals: false,
    passWithNoTests: true,
    coverage: {
      reporter: ['text', 'html'],
      include: ['js/**/*.js'],
      exclude: ['js/**/*.{test,spec}.js', 'js/main.js'],
    },
  },
});
