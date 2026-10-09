import { createConfig } from '@timeline/config/eslint';

export default [
  ...createConfig({ tsconfigRootDir: import.meta.dirname, react: true }),
  {
    files: ['src/runtime/context.tsx', 'src/runtime/hooks.ts'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
];
