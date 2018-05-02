#!/usr/bin/env node

const chalk = require('chalk')
const commander = require('commander')
const axios = require('axios')
const SocksProxyAgent = require('socks-proxy-agent')

const packageJson = require('../package.json')
const Events = require('../src/Events')
const M3U8Downloader = require('../src/M3U8Downloader')

function logHelpInfo() {
  console.log()
  console.log(` Only ${chalk.green('<url>')} is required!`)
}

function logErrorURL() {
  console.log()
  console.error('Please specify the m3u8 URL:')
  console.log(` ${chalk.cyan(program.name())} ${chalk.green('<url>')}`)
  console.log()
  console.log('For example:')
  console.log(` ${chalk.cyan(program.name())} ${chalk.green('http://example.com/somepath/some.m3u8')}`)
  console.log()
  console.log(
    `Run ${chalk.cyan(`${program.name()} --help`)} to see all options.`
  )
}

function getRange(val) {
  return val.split('..').map((n, i) => (i === 1 && n === '') ? Infinity : Number(n))
}

let m3u8URL

const program = new commander.Command(packageJson.name)
  .version(packageJson.version)
  .arguments('<url>')
  .usage(`${chalk.green('<url>')} [options]`)
  .action((url) => (m3u8URL = url))
  .option('-d, --dest <value>', 'Target file dest')
  .option('-r, --range <a>..<b>', "Range of the m3u8 segments, it's [a, b)", getRange)
  .option('-p, --proxy [value]', 'Proxy value, eg. socks5://127.0.0.1:1080')
  .option('--append', 'Write stream flags was "a", append mode')
  .option('--quiet', 'No infos')
  .option('--debug', 'Debug infos')
  .on('--help', logHelpInfo)
  .parse(process.argv)

if (typeof m3u8URL === 'undefined') {
  logErrorURL()
  process.exit(1)
}

if (program.proxy) {
  let httpProxy, httpsProxy
  if (typeof program.proxy === 'boolean') {
    httpProxy = process.env['http_proxy']
    httpsProxy = process.env['https_proxy']
  } else {
    httpProxy = program.proxy
    httpsProxy = program.proxy
  }
  axios.default.httpAgent = new SocksProxyAgent(httpProxy)
  axios.default.httpsAgent = new SocksProxyAgent(httpsProxy)
}

const downloader = new M3U8Downloader(m3u8URL, {
  range: program.range,
  dest: program.dest,
  append: program.append
})
  .on(Events.DEBUG, (msg) => {
    if (!program.debug) return;
    process.stdout.write(`${chalk.blue(`[${new Date().toLocaleString()}] DEBUG ->`)} ${msg}\n`)
  })
  .on(Events.INFO, (err, update) => {
    if (program.quiet) return;
    if (update) {
      process.stdout.moveCursor(0, -1)
      process.stdout.cursorTo(0)
      process.stdout.clearLine(0)
    }
    process.stdout.write(`${chalk.green(`[${new Date().toLocaleString()}] INFO ->`)} ${err}\n`)
  })
  .on(Events.ERROR, (err) => {
    process.stdout.write(`${chalk.red(`[${new Date().toLocaleString()}] ERROR ->`)} ${err}\n`)
    process.exitCode = 1
  })

downloader.start()
