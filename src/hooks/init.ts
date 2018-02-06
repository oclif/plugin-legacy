import * as Config from '@anycli/config'
import {color} from '@heroku-cli/color'
import {Command, flags as Flags, vars} from '@heroku-cli/command'
import * as fs from 'fs'
import * as path from 'path'
import * as semver from 'semver'
import {inspect} from 'util'

import {compact} from '../util'

const debug = require('debug')('@anycli/plugin-legacy')

export const init: Config.Hook<'init'> = async function (opts) {
  opts.config.plugins.forEach((p, i) => {
    if (p.valid) return
    delete Config.Plugin.loadedPlugins[p.root]
    opts.config.plugins[i] = new PluginLegacy(opts.config, p)
  })
}

class PluginLegacy extends Config.Plugin implements Config.IPlugin {
  constructor(public config: Config.IConfig, public base: Config.IPlugin) {
    super(base)
  }

  protected _manifest(ignoreManifest: boolean) {
    if (fs.existsSync(path.join(this.root, '.anycli.manifest.json'))) return super._manifest(ignoreManifest)
    let manifest: Config.Manifest = {
      version: this.version,
      commands: {},
    }
    if (this.commandsDir) {
      manifest = Config.Manifest.build(this.version, this.commandsDir, id => this._findCommand(id))
    }
    manifest.commands = {
      ...manifest.commands,
      ...this.moduleCommands,
    }
    return manifest
  }

  protected get moduleCommands(): {[id: string]: Config.Command} {
    const main = this.pjson.main
    if (!main) return {}
    const module = require(path.join(this.root, main))
    if (!module.commands) return {}
    return module.commands
    .map((c: any) => this.convertCommand(c))
    .reduce((commands: {[id: string]: Config.Command}, c: Config.Command.Class) => {
      commands[c.id] = Config.Command.toCached(c)
      return commands
    }, {} as {[id: string]: Config.Command})
  }

  private convertCommand(c: any): Config.Command.Class {
    if (this.isICommand(c)) return this.convertFromICommand(c)
    if (this.isV5Command(c)) return this.convertFromV5(c)
    if (this.isFlowCommand(c)) return this.convertFromFlow(c)
    debug(c)
    throw new Error(`Invalid command: ${inspect(c)}`)
  }

  private convertFromICommand(c: any): any {
    if (!c.id) c.id = compact([c.topic, c.command]).join(':')
    return c
  }

  private convertFromFlow(c: any): any {
    if (!c.id) c.id = compact([c.topic, c.command]).join(':')
    c._version = c._version || '0.0.0'
    return c
  }

  private convertFromV5(c: any): any {
    class V5 extends Command {
      static id = compact([c.topic, c.command]).join(':')
      static description = c.description
      static hidden = !!c.hidden
      static args = (c.args || []).map((a: any) => ({
        ...a,
        required: a.required !== false && !(a as any).optional,
      }))
      static flags = convertFlagsFromV5(c.flags)
      static variableArgs = !!c.variableArgs
      static help = c.help
      static aliases = c.aliases || []
      static usage = c.usage

      async run() {
        const {flags, argv, args} = this.parse(this.constructor as any)
        const ctx: any = {
          version: this.config.userAgent,
          supportsColor: color.enabled,
          auth: {},
          debug: !!this.config.debug,
          debugHeaders: this.config.debug > 1 || ['1', 'true'].includes((process as any).env.HEROKU_DEBUG_HEADERS),
          flags,
          args: c.variableArgs ? argv : args,
          app: flags.app,
          org: flags.org,
          team: flags.team,
          config: this.config,
          apiUrl: vars.apiUrl,
          herokuDir: this.config.cacheDir,
          apiToken: this.heroku.auth,
          apiHost: vars.apiHost,
          gitHost: vars.gitHost,
          httpGitHost: vars.httpGitHost,
          cwd: process.cwd(),
        }
        ctx.auth.password = ctx.apiToken
        const ansi = require('ansi-escapes')
        process.once('exit', () => {
          if (process.stderr.isTTY) {
            process.stderr.write(ansi.cursorShow)
          }
        })
        return c.run(ctx)
      }
    }

    if (c.needsApp || c.wantsApp) {
      V5.flags.app = Flags.app({required: !!c.needsApp})
      V5.flags.remote = Flags.remote()
    }
    if (c.needsOrg || c.wantsOrg) {
      let opts = {required: !!c.needsOrg, hidden: false, description: 'team to use'}
      V5.flags.team = Flags.team(opts)
      V5.flags.org = Flags.team({hidden: true})
    }
    return V5
  }

  private isICommand(c: any) {
    if (!c._version) return false
    return semver.gte(c._version, '11.0.0')
  }

  private isV5Command(command: any): any {
    let c = command
    return !!(typeof c === 'object')
  }

  private isFlowCommand(command: any): any {
    let c = command as any
    return typeof c === 'function'
    // if (c._version && deps.semver.lt(c._version, '11.0.0')) return true
  }
}

function convertFlagsFromV5(flags: any): any {
  if (!flags) return {}
  if (!Array.isArray(flags)) return flags
  return flags.reduce(
    (flags, flag) => {
      let opts = {
        char: flag.char,
        description: flag.description,
        hidden: flag.hidden,
        required: flag.required || flag.optional === false,
        parse: flag.parse,
      }
      for (let [k, v] of Object.entries(opts)) {
        if (v === undefined) delete (opts as any)[k]
      }
      if (!opts.parse) delete opts.parse
      flags[flag.name] = flag.hasValue ? Flags.string(opts as any) : Flags.boolean(opts as any)
      return flags
    },
    {} as any,
  )
}
