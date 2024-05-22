import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('legacy', () => {
  it('runs legacy command', async () => {
    const {stdout} = await runCommand('status')
    expect(stdout).to.contain('No known issues at this time')
  })
})
