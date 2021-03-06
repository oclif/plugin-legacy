import * as HCli from '@heroku-cli/command'
import {color as Color} from '@oclif/color'
import * as Config from '@oclif/config'
import * as path from 'path'
import * as Semver from 'semver'
import {inspect} from 'util'

import {compact} from './util'

const debug = require('debug')('@oclif/plugin-legacy')
const pjson = require('../package.json')

function convertFlagsFromV5(Flags: any, flags: any): any {
  if (!flags) return {}
  if (!Array.isArray(flags)) return flags
  return flags.reduce(
    (flags, flag) => {
      const opts = {
        char: flag.char,
        description: flag.description,
        hidden: flag.hidden,
        required: flag.required || flag.optional === false,
        parse: flag.parse,
        completion: flag.completion,
        default: flag.default,
      }
      for (const [k, v] of Object.entries(opts)) {
        if (v === undefined) delete (opts as any)[k]
      }
      if (!opts.parse) delete opts.parse
      flags[flag.name] = flag.hasValue ? Flags.string(opts as any) : Flags.boolean(opts as any)
      return flags
    },
    {} as any,
  )
}

type LegacyFlags = {
  app?: string;
  org?: string;
  team?: string;
}

export class PluginLegacy extends Config.Plugin implements Config.IPlugin {
  _base = `${pjson.name}@${pjson.version}`

  protected _moduleCommands?: Config.Command.Class[]

  protected _moduleTopics?: Config.Topic[]

  constructor(public config: Config.IConfig, public base: Config.IPlugin) {
    super(base)
    debug('loading legacy plugin', base.root)
  }

  get topics(): Config.Topic[] {
    return super.topics
    .concat(this.moduleTopics)
  }

  get commandIDs(): string[] {
    return super.commandIDs
    .concat(this.moduleCommands.map(c => c.id))
  }

  findCommand(id: string, opts: {must: true}): Config.Command.Class

  findCommand(id: string, opts?: {must?: boolean}): Config.Command.Class | undefined

  findCommand(id: string, opts: {must?: boolean} = {}) {
    let cmd = super.findCommand(id)
    if (cmd) return this.convertCommand(cmd)
    cmd = this.moduleCommands.find(c => c.id === id)
    if (cmd) {
      cmd.plugin = this
      return this.convertCommand(cmd)
    }
    if (opts.must) throw new Error(`command ${id} not found`)
  }

  protected get moduleCommands(): Config.Command.Class[] {
    if (this._moduleCommands) return this._moduleCommands
    const main = this.pjson.main
    if (!main) return []
    const module = require(path.join(this.root, main))
    if (!module.commands) return []
    debug('loading module commands', this.root)
    this._moduleCommands = module.commands
    .map((c: any) => this.convertCommand(c))
    return this._moduleCommands!
  }

  protected get moduleTopics(): Config.Topic[] {
    if (this.pjson.oclif.topics) return []
    if (this._moduleTopics) return this._moduleTopics
    const main = this.pjson.main
    if (!main) return []
    const module = require(path.join(this.root, main))
    if (!module.commands) return []
    debug('loading module topics', this.root)
    this._moduleTopics = module.topics
    return this._moduleTopics!
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
    const {Command, flags: Flags, vars} = require('@heroku-cli/command') as typeof HCli
    class V5 extends Command {
      static id = compact([c.topic, c.command]).join(':')

      static description = [c.description, c.help].join('\n')

      static hidden = Boolean(c.hidden)

      static args = (c.args || []).map((a: any) => ({
        ...a,
        required: a.required !== false && !(a as any).optional,
      }))

      static flags = convertFlagsFromV5(Flags, c.flags)

      static strict = c.strict || !c.variableArgs

      static help = c.help

      static aliases = c.aliases || []

      static usage = c.usage

      static examples = c.examples || c.example

      async run() {
        const color: typeof Color = require('@oclif/color').default
        const {flags, argv, args} = this.parse(this.constructor as any)
        const ctx: any = {
          version: this.config.userAgent,
          supportsColor: color.enabled,
          auth: {},
          debug: Boolean(this.config.debug),
          debugHeaders: this.config.debug > 1 || ['1', 'true'].includes((process as any).env.HEROKU_DEBUG_HEADERS),
          flags,
          args: c.variableArgs ? argv : args,
          app: (flags as LegacyFlags).app,
          org: (flags as LegacyFlags).org,
          team: (flags as LegacyFlags).team,
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
      V5.flags.app = Flags.app({required: Boolean(c.needsApp)})
      V5.flags.remote = Flags.remote()
    }
    if (c.needsOrg || c.wantsOrg) {
      const opts = {required: Boolean(c.needsOrg), hidden: false, description: 'team to use'}
      V5.flags.team = Flags.team(opts)
      V5.flags.org = Flags.team({char: 'o', hidden: true})
    }
    return V5
  }

  private isICommand(c: any) {
    const semver: typeof Semver = require('semver')
    if (!c._version) return false
    return semver.gte(c._version, '11.0.0')
  }

  private isV5Command(command: any): any {
    const c = command
    return Boolean(typeof c === 'object')
  }

  private isFlowCommand(command: any): any {
    const c = command as any
    return typeof c === 'function'
    // if (c._version && deps.semver.lt(c._version, '11.0.0')) return true
  }
}
