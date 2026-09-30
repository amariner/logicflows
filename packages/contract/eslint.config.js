import { baseConfig } from '../../eslint.config.js';

export default [
  ...baseConfig,
  {
    // El contrato también se usa en el navegador: su código no depende de
    // módulos de Node.js. Las pruebas sí pueden usarlos.
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['node:*'], message: 'El contrato no depende de Node.js.' }] },
      ],
    },
  },
];
