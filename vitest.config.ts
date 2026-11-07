import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'scripts',
          root: './scripts',
          environment: 'node',
          include: ['*.test.ts', 'package/*.test.ts'],
        },
      },
      {
        test: {
          name: 'shared',
          root: './packages/shared',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'server',
          root: './apps/server',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'relay-protocol',
          root: './packages/relay-protocol',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'providers',
          root: './packages/providers',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'relay',
          root: './apps/relay',
          environment: 'node',
          include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'mobile',
          root: './apps/mobile',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
      {
        test: {
          name: 'site',
          root: './apps/site',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      './apps/web/vitest.config.ts',
      './packages/ui/vitest.config.ts',
    ],
  },
});
