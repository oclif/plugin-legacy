import {expect, test} from '@oclif/test'

describe('legacy', () => {
  test
  .stdout()
  .command('status')
  .it(ctx => expect(ctx.stdout).to.contain('No known issues at this time'))
})
