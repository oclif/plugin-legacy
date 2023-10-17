/* eslint-disable unicorn/prefer-spread */
import * as HCli from '@heroku-cli/command'
import {color as Color} from '@oclif/color'
import {Command, Interfaces, Plugin} from '@oclif/core'
import * as path from 'path'
import * as Semver from 'semver'
import {inspect} from 'util'

import {compact} from './util'

const debug = require('debug')('@oclif/plugin-legacy')
const pjson = require('../package.json')

function convertFlagsFromV5(Flags: any, flags: any): any {
  if (!flags) return {}
  if (!Array.isArray(flags)) return flags
  // eslint-disable-next-line unicorn/no-array-reduce
  return flags.reduce((flags, flag) => {
    const opts = {
      char: flag.char,
      completion: flag.completion,
      default: flag.default,
      description: flag.description,
      hidden: flag.hidden,
      parse: flag.parse,
      required: flag.required || flag.optional === false,
    }
    for (const [k, v] of Object.entries(opts)) {
      if (v === undefined) delete (opts as any)[k]
    }

    if (!opts.parse) delete opts.parse
    flags[flag.name] = flag.hasValue ? Flags.string(opts as any) : Flags.boolean(opts as any)
    return flags
  }, {} as any)
}

type LegacyFlags = {
  app?: string
  org?: string
  team?: string
}

export class PluginLegacy extends Plugin implements Interfaces.Plugin {
  _base = `${pjson.name}@${pjson.version}`

  protected _moduleCommands?: Command.Class[]

  protected _moduleTopics?: Interfaces.Topic[]

  constructor(
    public config: Interfaces.Config,
    public base: Interfaces.Plugin,
  ) {
    super(base)
    debug('loading legacy plugin', base.root)
  }

  get commandIDs(): string[] {
    return super.commandIDs.concat(this.moduleCommands.map((c) => c.id))
  }

  protected get moduleCommands(): Command.Class[] {
    if (this._moduleCommands) return this._moduleCommands
    const {main} = this.pjson
    if (!main) return []
    const module = require(path.join(this.root, main))
    if (!module.commands) return []
    debug('loading module commands', this.root)
    this._moduleCommands = module.commands.map((c: any) => this.convertCommand(c))
    return this._moduleCommands!
  }

  protected get moduleTopics(): Interfaces.Topic[] {
    if (this.pjson.oclif.topics) return []
    if (this._moduleTopics) return this._moduleTopics
    const {main} = this.pjson
    if (!main) return []
    const module = require(path.join(this.root, main))
    if (!module.commands) return []
    debug('loading module topics', this.root)
    this._moduleTopics = module.topics
    return this._moduleTopics!
  }

  get topics(): Interfaces.Topic[] {
    return super.topics.concat(this.moduleTopics)
  }

  async findCommand(id: string, opts: {must: true}): Promise<Command.Class>

  async findCommand(id: string, opts?: {must?: boolean}): Promise<Command.Class | undefined>

  async findCommand(id: string, opts: {must?: boolean} = {}): Promise<Command.Class | undefined> {
    let cmd = await super.findCommand(id)
    if (cmd) return this.convertCommand(cmd)
    cmd = this.moduleCommands.find((c) => c.id === id)
    if (cmd) {
      cmd.plugin = this
      return this.convertCommand(cmd)
    }

    if (opts.must) throw new Error(`command ${id} not found`)
  }

  private convertCommand(c: any): Command.Class {
    if (this.isICommand(c)) return this.convertFromICommand(c)
    if (this.isV5Command(c)) return this.convertFromV5(c)
    if (this.isFlowCommand(c)) return this.convertFromFlow(c)
    debug(c)
    throw new Error(`Invalid command: ${inspect(c)}`)
  }

  private convertFromFlow(c: any): any {
    if (!c.id) c.id = compact([c.topic, c.command]).join(':')
    c._version = c._version || '0.0.0'
    return c
  }

  private convertFromICommand(c: any): any {
    if (!c.id) c.id = compact([c.topic, c.command]).join(':')
    return c
  }

  private convertFromV5(c: any): any {
    const {Command, flags: Flags, vars} = require('@heroku-cli/command') as typeof HCli
    class V5 extends Command {
      static aliases = c.aliases || []

      // eslint-disable-next-line unicorn/consistent-function-scoping
      static args = (c.args || []).map((a: any) => ({
        ...a,
        required: a.required !== false && !(a as any).optional,
      }))

      static description = [c.description, c.help].join('\n')

      static examples = c.examples || c.example

      static flags = convertFlagsFromV5(Flags, c.flags)

      static help = c.help

      static hidden = Boolean(c.hidden)

      static id = compact([c.topic, c.command]).join(':')

      static strict = c.strict || !c.variableArgs

      static usage = c.usage

      async run() {
        const color: typeof Color = require('@oclif/color').default
        const {args, argv, flags} = this.parse(this.constructor as any)
        const ctx: any = {
          apiHost: vars.apiHost,
          apiToken: this.heroku.auth,
          apiUrl: vars.apiUrl,
          app: (flags as LegacyFlags).app,
          args: c.variableArgs ? argv : args,
          auth: {},
          config: this.config,
          cwd: process.cwd(),
          debug: Boolean(this.config.debug),
          debugHeaders: this.config.debug > 1 || ['1', 'true'].includes((process as any).env.HEROKU_DEBUG_HEADERS),
          flags,
          gitHost: vars.gitHost,
          herokuDir: this.config.cacheDir,
          httpGitHost: vars.httpGitHost,
          org: (flags as LegacyFlags).org,
          supportsColor: Boolean(color.supports.stdout),
          team: (flags as LegacyFlags).team,
          version: this.config.userAgent,
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
      const opts = {description: 'team to use', hidden: false, required: Boolean(c.needsOrg)}
      V5.flags.team = Flags.team(opts)
      V5.flags.org = Flags.team({char: 'o', hidden: true})
    }

    return V5
  }

  private isFlowCommand(command: any): any {
    const c = command as any
    return typeof c === 'function'
    // if (c._version && deps.semver.lt(c._version, '11.0.0')) return true
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
}
