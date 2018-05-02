const path = require('path')
const http = require('http')
const https = require('https')
const EventEmitter = require('events')

const axios = require('axios')
const fs = require('fs-extra')
const SocksProxyAgent = require('socks-proxy-agent')

const Events = require('./Events')
const M3U8Parser = require('./M3U8Parser')

class M3U8Downloader extends EventEmitter {
  constructor(url, {
    dest = '.',
    range = [0, Infinity],
    filename = '',
    fileFlags = 'w',
  } = options) {
    super()

    this.url = url
    this.dest = dest
    this.range = range
    this.fileFlags = fileFlags
    this.filename = filename
    this.filepath = ''

    this.pool = []
    this.parser = null

    this.counter = {
      failure: 0,
      success: 0,
    }
  }

  start() {
    this.emit(Events.START)
    this.emit(Events.INFO, `Get M3U8URL: ${this.url}`)

    this.parser = new M3U8Parser(this.url)
      .on(Events.PARSER_READY, this.handleParserReady.bind(this))
      .on(Events.PARSER_ERROR, err => this.emit(Events.ERROR, err))
  }

  to(len, unit = 'MB') {
    const UNIT_MAP = {
      'KB': 1024,
      'MB': 1024 * 1024,
      'GB': 1024 * 1024 * 1024
    }
    return len / UNIT_MAP[unit.toUpperCase()]
  }

  handleParserReady() {
    this.correctRange()
    this.setFilename()
    this.createFile()
    this.initDownload()
  }

  downloadSegment(segment) {
    const segmentInfo = `Segment-${segment.index} (${segment.index}/${this.range[1]})`
    this.emit(Events.TRACE, `${segmentInfo}: Pending...`)

    let chunkLen = 0

    return axios
      .get(segment.url, { responseType: 'stream' })
      .then(res => {
        const segmentLen = this.to(parseInt(res.headers['content-length'], 10)).toFixed(4)

        res.data.on('data', (chunk) => {
          this.writeStream.write(chunk)
          chunkLen += parseInt(chunk.length)
          this.emit(Events.TRACE, `${segmentInfo}: ${this.to(chunkLen).toFixed(4)} / ${segmentLen} MB. `)
        })

        res.data.on('end', () => {
          this.counter.success++
          this.emit(Events.INFO, `${segmentInfo}: Size - ${segmentLen} MB. Success!`)
          this.emit(Events.DOWNLOAD_SEGMENT)
        })
      })
      .catch(err => {
        this.counter.failure++
        this.emit(Events.DEBUG, `${segmentInfo}: ${JSON.stringify(segment)}`)
        this.emit(Events.ERROR, `${segmentInfo}: ${err.message}`)
        this.emit(Events.DOWNLOAD_SEGMENT)
      })
  }

  initDownload() {
    this.setSegmentsPool()
    this.emit(Events.INFO, '------> Start Downloading <------')

    this.on(Events.DOWNLOAD_SEGMENT, (segment) => {
      if (this.pool.length <= 0) {
        this.writeStream.close()
        this.emit(Events.INFO, '------> Finish Download <------')
        this.emit(Events.DONE)
      } else {
        this.downloadSegment(this.pool.shift())
      }
    })

    this.emit(Events.DOWNLOAD_SEGMENT)
  }

  setSegmentsPool() {
    const [from, to] = this.range
    for (let i = from; i < to; i++) {
      this.pool.push(this.parser.segments[i])
    }
  }

  createFile() {
    this.filepath = path.resolve(this.dest, this.filename)
    this.emit(Events.INFO, `Filepath: ${this.filepath}`)

    fs.ensureFileSync(this.filepath)
    this.writeStream = fs.createWriteStream(this.filepath, {
      flags: this.fileFlags,
      autoclose: false,
    })
    this.emit(Events.INFO, `Write File Flags: ${this.fileFlags}`)
  }

  setFilename() {
    this.filename = this.filename ? this.filename : this.parser.name
    this.emit(Events.INFO, `Filename: ${this.filename}`)
  }

  correctRange() {
    const segmentsLen = this.parser.segments.length
    let min = Math.min(this.range[0], this.range[1])
    let max = Math.max(this.range[0], this.range[1])
    // if it's percent
    if (min >= 0 && min <= 1 && max >= 0 && max <= 1) {
      min = Math.floor(segmentsLen * min)
      max = Math.floor(segmentsLen * max)
    }
    min = Math.max(min, 0)
    max = Math.min(max, segmentsLen)
    this.range = [min, max]

    this.emit(Events.INFO, `Download segment ranges: ${min} - ${max}`)
    this.emit(Events.INFO, `Download segment length: ${max - min}`)
  }
}

module.exports = M3U8Downloader
