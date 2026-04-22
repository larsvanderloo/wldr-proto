export * from './common.js'
export * as Employees from './employees/index.js'
export * as Auth from './auth/index.js'

// Flat re-exports zodat consumers `@hr-saas/contracts` kunnen importeren
// zonder subpath (Vite/Rollup heeft moeite met pnpm-workspace subpath-exports).
export * from './auth/index.js'
