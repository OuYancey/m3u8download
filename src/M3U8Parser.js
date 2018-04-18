const { URL } = require('url')
const path = require('path')
const EventEmitter = require('events')
const axios = require('axios')

const Events = require('./Events')

class M3U8Parser extends EventEmitter {
  constructor(url) {
    super()

    this.text = ''
    this.url = url
    this.segments = []
    this.basename = path.basename(this.url)
    this.name = this.setName()

    this.getM3U8Text()
  }

  getM3U8Text() {
    return axios
      .get(this.url)
      .then(res => {
        this.text = res.data
        this.segments = this.parseText()
        this.emit(Events.INFOS, `Total segments length: ${this.segments.length}`)
        this.emit(Events.DEBUG, `Got M3U8Text: ${this.text}`)
        this.emit(Events.READY)
      })
      .catch(err => this.emit(Events.ERROR, `Load M3U8 failure: ${err.message}`))
  }

  setName() {
    const MAX_NAME_LENGTH = 20
    const encodedURL = this.url.match(/\w+/g).join('')
    if (encodedURL.length < MAX_NAME_LENGTH) {
      return encodedURL
    }

    let name = ''
    const gap = Math.ceil(encodedURL.length / MAX_NAME_LENGTH)
    for (let i = 0; i < encodedURL.length; i = i + gap) {
      name += encodedURL[i]
    }
    return name + '.ts'
  }

  parseText() {
    const EXTText = this.text.match(/#EXTINF([^]+?)(?=#EXT-X-ENDLIST)/)
    if (!EXTText || !EXTText.length) {
      this.emit(Events.ERROR, `Not found M3U8 text in url: ${this.url}`)
      this.emit(Events.DEBUG, `Found: \n ${this.text}`)
      return
    }

    const EXTINFs = EXTText[0].trim()
    const EXTINFList = EXTINFs.split(/\s+/)

    const segments = []
    for (let i = 0; i < EXTINFList.length / 2; i++) {
      segments.push(this.parseEXTItem(EXTINFList[2 * i], EXTINFList[2 * i + 1]))
    }
    return segments
  }

  parseEXTItem(EXTTime, EXTPath) {
    const time = Number(EXTTime.substring('#EXTINF:'.length, EXTTime.length - 1))
    const name = EXTPath.match(/\/?.*?.ts/g)[0].split('/').find(slice => slice.endsWith('.ts'))

    return {
      origin: `${EXTTime}\n${EXTPath}`,
      url: this.getEXTItemURL(EXTPath),
      filename: `${this.name}/${name}`,
      time,
    }
  }

  getEXTItemURL(EXTPath) {
    const _URL = new URL(this.url)
    if (EXTPath.startsWith('/')) {
      return `${_URL.origin}${EXTPath}`
    } else if (EXTPath.startsWith('http')) {
      return EXTPath
    } else {
      return `${_URL.href.replace(this.basename, EXTPath)}`
    }
  }
}

module.exports = M3U8Parser
