import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'

const __dirname = dirname(fileURLToPath(import.meta.url))
const compat = new FlatCompat({ baseDirectory: __dirname })

const eslintConfig = [
  {
    ignores: ['.next/**', 'node_modules/**', 'out/**', 'public/**', '.expo/**', 'next-env.d.ts'],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Existing code uses `any` heavily (mostly Supabase rows); keep it visible
      // as a warning for gradual cleanup instead of failing `next build`.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Stylistic only — React renders raw apostrophes/quotes in JSX text fine.
      'react/no-unescaped-entities': 'off',
    },
  },
]

export default eslintConfig
