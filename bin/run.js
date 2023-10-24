#!/usr/bin/env node
// eslint-disable-next-line node/shebang, unicorn/prefer-top-level-await
;(async () => {
  const {execute} = await import('@oclif/core')
  await execute({dir: __dirname})
})()
