import {expect, test} from '@anycli/test'

describe('legacy', () => {
  test
  .stdout()
  .command('status')
  .it(ctx => expect(ctx.stdout).to.contain('No known issues at this time'))
})
