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
    append = false,
  } = options) {
    super()

    this.url = url
    this.dest = dest
    this.range = range
    this.append = append
    this.filename = filename
    this.filepath = ''
    this.pool = []
    this.parser = null

    this.count = {
      failure: 0,
      success: 0,
    }
  }

  start() {
    this.parser = this.initParser()
  }

  initParser() {
    this.emit(Events.INFOS, `Get M3U8URL: ${this.url}`)
    return new M3U8Parser(this.url)
      .on(Events.READY, this.handleParserReady.bind(this))
      .on(Events.INFOS, msg => this.emit(Events.INFOS, msg))
      .on(Events.DEBUG, msg => this.emit(Events.DEBUG, msg))
      .on(Events.ERROR, err => this.emit(Events.ERROR, err))
  }

  handleParserReady() {
    this.correctRange()
    this.setFilename()
    this.createFile()
    this.initDownload()
  }

  downloadSegment(segment) {
    const handleError = (errMessage) => {
      this.count.failure++
      this.emit(Events.DEBUG, `Segment-${segment._index}: ${JSON.stringify(segment)}`)
      this.emit(Events.ERROR, `Segment-${segment._index}: ${errMessage}`)
      this.emit(Events.SEGMENT_START)
    }

    const handleEnd = () => {
      this.count.success++
      this.emit(Events.INFOS, `Segment-${segment._index}: Size - ${segmentLen} MB. Success! `)
      this.emit(Events.SEGMENT_START)
    }

    let segmentLen

    return axios
      .get(segment.url, { responseType: 'stream' })
      .then(res => {
        segmentLen = (parseInt(res.headers['content-length'], 10) / 1024 / 1024).toFixed(4)
        res.data.on('data', chunk => this.writeStream.write(chunk))
        res.data.on('end', handleEnd)
        res.data.on('error', err => handleError(err.message))
      })
      .catch(err => handleError(err.message))
  }

  getSegmentsPool() {
    const pool = []
    const [from, to] = this.range
    for (let i = from; i < to; i++) {
      const segment = this.parser.segments[i]
      segment._index = i
      pool.push(segment)
    }
    return pool
  }

  initDownload() {
    this.pool = this.getSegmentsPool()
    this.emit(Events.INFOS, '------> Start Downloading <------')

    this.on(Events.SEGMENT_START, (segment) => {
      if (this.pool.length <= 0) {
        return this.emit(Events.SEGMENT_DONE)
      }
      this.downloadSegment(this.pool.shift())
    })

    this.on(Events.SEGMENT_DONE, () => {
      this.emit(Events.INFOS, '------> Finish Download <------')
      this.emit(Events.INFOS, `Total - ${this.count.success + this.count.failure} `)
      this.emit(Events.INFOS, `Success - ${this.count.success}`)
      this.emit(Events.INFOS, `Failure - ${this.count.failure}`)
      this.writeStream.close()
    })

    this.emit(Events.SEGMENT_START)
  }

  createFile() {
    this.filepath = path.resolve(this.dest, this.filename)
    fs.ensureFileSync(this.filepath)
    this.writeStream = fs.createWriteStream(this.filepath, { 
      autoclose: false,
      flags: this.append ? 'a' : 'w'
    })
    this.emit(Events.INFOS, `Filepath: ${this.filepath}`)
  }

  setFilename() {
    this.filename = this.filename ? this.filename : this.parser.name
    this.emit(Events.INFOS, `Filename: ${this.filename}`)
  }

  correctRange() {
    let min = Math.min(this.range[0], this.range[1])
    let max = Math.max(this.range[0], this.range[1])
    min = Math.max(min, 0)
    max = Math.min(max, this.parser.segments.length)
    this.range = [min, max]
    this.emit(Events.INFOS, `Download segment ranges: ${min} - ${max}`)
    this.emit(Events.INFOS, `Download segment length: ${max - min}`)
  }
}

module.exports = M3U8Downloader
