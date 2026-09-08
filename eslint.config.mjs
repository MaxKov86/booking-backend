import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Express визначає error-handling middleware за КІЛЬКІСТЮ
      // параметрів (рівно 4: err, req, res, next) — тому навмисно
      // невикористаний `next` не можна просто прибрати з сигнатури.
      // '_'-префікс сигналізує "навмисно не використовується".
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**'],
  }
);
