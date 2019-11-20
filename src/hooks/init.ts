import * as Config from '@oclif/config'

import {PluginLegacy} from '..'
import {compact} from '../util'

export const init: Config.Hook<'init'> = async function (opts) {
  await Promise.all(opts.config.plugins.map(async (p, i) => {
    if (p.valid) return
    try {
      const plugin = new PluginLegacy(opts.config, p)
      await plugin.load()
      opts.config.plugins[i] = plugin // eslint-disable-line require-atomic-updates
    } catch (error) {
      error.name = `@oclif/plugin-legacy: Plugin ${p.name}: ${error.name}`
      error.detail = compact([error.detail, p.root]).join(' ')
      process.emitWarning(error)
    }
  }))
}
