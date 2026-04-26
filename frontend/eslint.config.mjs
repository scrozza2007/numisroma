import nextCwv from 'eslint-config-next/core-web-vitals';

export default [
  ...nextCwv,
  {
    ignores: ['.next/**', 'node_modules/**', 'cypress/**', 'public/**']
  },
  {
    rules: {
      'react/no-unescaped-entities': 'off',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      '@next/next/no-img-element': 'warn'
    }
  }
];
