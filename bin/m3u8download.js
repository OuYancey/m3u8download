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

let m3u8URL

const program = new commander.Command(packageJson.name)
  .version(packageJson.version)
  .arguments('<url>')
  .usage(`${chalk.green('<url>')} [options]`)
  .action((url) => (m3u8URL = url))
  .option('-d, --dest <value>', 'Target file dest')
  .option('-r, --range <a>..<b>', "Range of the m3u8 segments, it's [a, b)", (val) => val.split('..').map(Number))
  .option('-p, --proxy <value>', 'Proxy value, eg. socks5://127.0.0.1:1080')
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
  axios.default.httpAgent = new SocksProxyAgent(program.proxy)
  axios.default.httpsAgent = new SocksProxyAgent(program.proxy)
}

const downloader = new M3U8Downloader(m3u8URL, { 
  range: program.range, 
  dest: program.dest,
  append: program.append
})
  .on(Events.DEBUG, (msg) => {
    if (!program.debug) return;
    console.log(chalk.blue(`[${new Date().toLocaleString()}] DEBUG -> `), msg)
  })
  .on(Events.INFOS, (err) => {
    if (program.quiet) return;
    console.log(chalk.green(`[${new Date().toLocaleString()}] INFOS -> `), err)
  })
  .on(Events.ERROR, (err) => {
    console.log(chalk.red(`[${new Date().toLocaleString()}] ERROR -> `), err)
    process.exitCode = 1
  })

downloader.start()
