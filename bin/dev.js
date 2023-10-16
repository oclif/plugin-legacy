#!/usr/bin/env -S node --loader ts-node/esm --no-warnings=ExperimentalWarning
// eslint-disable-next-line node/shebang, unicorn/prefer-top-level-await
;(async () => {
  const {execute} = await import('@oclif/core')
  await execute({development: true, dir: __dirname})
})()
