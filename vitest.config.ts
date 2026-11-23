import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    // _to_delete holds code that has been replaced and is kept only until it is
    // certain nothing is missing. Its tests import modules that no longer
    // exist, so collecting them fails the whole suite for no reason.
    exclude: [
      '**/node_modules/**', '**/dist/**', '**/.next/**',
      '**/_to_delete/**',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
