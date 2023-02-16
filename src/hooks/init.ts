import * as Config from '@oclif/config'
import {CLIError} from '@oclif/errors'

import {PluginLegacy} from '..'
import {compact} from '../util'

export const init: Config.Hook<'init'> = async function (opts) {
  const plugins = await Promise.all(opts.config.plugins.map(async (p, i) => {
    if (p.valid) return
    try {
      const plugin = new PluginLegacy(opts.config, p)
      await plugin.load()
      // Insert the legacy plugin into the plugins array. This only works for @oclif/config based CLIs
      opts.config.plugins[i] = plugin // eslint-disable-line require-atomic-updates
      // Return the legacy plugin. @oclif/core will insert into the plugins array
      return plugin
    } catch (error) {
      const err = error as CLIError
      err.name = `@oclif/plugin-legacy: Plugin ${p.name}: ${err.name}`
      err.message = compact([err.message, p.root]).join(' ')
      process.emitWarning(err)
    }
  }))

  return plugins.filter(p => Boolean(p))
}
