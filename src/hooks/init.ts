import * as Config from '@oclif/config'

import {PluginLegacy} from '..'
import {compact} from '../util'

export const init: Config.Hook<'init'> = async function (opts) {
  await Promise.all(opts.config.plugins.map(async (p, i) => {
    if (p.valid) return
    try {
      const plugin = new PluginLegacy(opts.config, p)
      await plugin.load()
      opts.config.plugins[i] = plugin
    } catch (err) {
      err.name = `@oclif/plugin-legacy: Plugin ${p.name}: ${err.name}`
      err.detail = compact([err.detail, p.root]).join(' ')
      process.emitWarning(err)
    }
  }))
}
