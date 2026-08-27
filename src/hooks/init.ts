import {type Config, type Errors} from '@oclif/core'

import {PluginLegacy} from '../index.js'
import {compact} from '../util.js'

const hook = async function ({config}: {config: Config}) {
  const plugins = await Promise.all(
    config.getPluginsList().map(async (p) => {
      if (p.valid) return
      try {
        const plugin = new PluginLegacy(config, p)
        await plugin.load()
        // Return the legacy plugin. @oclif/core will insert into the plugins array
        return plugin
      } catch (error) {
        const err = error as Errors.CLIError
        err.name = `@oclif/plugin-legacy: Plugin ${p.name}: ${err.name}`
        err.message = compact([err.message, p.root]).join(' ')
        process.emitWarning(err)
      }
    }),
  )

  return plugins.filter(Boolean)
}

export default hook
