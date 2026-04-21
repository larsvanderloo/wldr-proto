export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'subject-case': [0],
    'subject-max-length': [2, 'always', 100],
    'body-max-line-length': [2, 'always', 120],
    'scope-enum': [
      2,
      'always',
      [
        'employees',
        'time-off',
        'onboarding',
        'reviews',
        'documents',
        'payroll',
        'auth',
        'web',
        'api',
        'contracts',
        'db',
        'infra',
        'ci',
        'deps',
        'docs',
      ],
    ],
  },
}
