import { buildApp } from './app.js'

const port = Number(process.env.PORT ?? 4000)
const host = process.env.HOST ?? '0.0.0.0'

buildApp()
  .then((app) =>
    app.listen({ port, host }).then(() => {
      app.log.info({ port, host }, 'API gestart')
    }),
  )
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
