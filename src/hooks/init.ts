import * as Config from '@anycli/config'

import {PluginLegacy} from '..'
import {compact} from '../util'

export const init: Config.Hook<'init'> = async function (opts) {
  opts.config.plugins.forEach((p, i) => {
    if (p.valid) return
    delete Config.Plugin.loadedPlugins[p.root]
    try {
      opts.config.plugins[i] = new PluginLegacy(opts.config, p)
    } catch (err) {
      err.name = `@anycli/plugin-legacy: Plugin ${p.name}: ${err.name}`
      err.detail = compact([err.detail, p.root]).join(' ')
      process.emitWarning(err)
    }
  })
}
