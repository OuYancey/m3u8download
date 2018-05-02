const { URL } = require('url')
const path = require('path')
const EventEmitter = require('events')
const axios = require('axios')

const Events = require('./Events')

class M3U8Parser extends EventEmitter {
  constructor(url) {
    super()

    this.url = url

    this.text = ''
    this.segments = []
    this.basename = path.basename(this.url)

    this.setName()
    this.getM3U8Text()
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

    this.name = name + '.ts'
  }

  getM3U8Text() {
    return axios
      .get(this.url)
      .then(res => {
        this.text = res.data
        this.parseText()

        this.emit(Events.PARSER_READY)
      })
      .catch(err => this.emit(Events.PARSER_ERROR, err))
  }

  parseText() {
    const EXTText = this.text.match(/#EXTINF([^]+?)(?=#EXT-X-ENDLIST)/)
    if (!EXTText || !EXTText.length) {
      throw Error(`Not found valid M3U8 text in url: ${this.url}, only found: ${this.text}`)
    }

    const EXTINFs = EXTText[0].trim()
    const EXTINFList = EXTINFs.split(/\s+/)

    for (let i = 0; i < EXTINFList.length / 2; i++) {
      this.segments.push(this.parseEXTItem(EXTINFList[2 * i], EXTINFList[2 * i + 1], i))
    }
  }

  parseEXTItem(EXTTime, EXTPath, EXTIndex) {
    const time = Number(EXTTime.substring('#EXTINF:'.length, EXTTime.length - 1))
    const name = EXTPath.match(/\/?.*?.ts/g)[0].split('/').find(slice => slice.endsWith('.ts'))

    return {
      origin: `${EXTTime}\n${EXTPath}`,
      url: this.getEXTItemURL(EXTPath),
      filename: `${this.name}/${name}`,
      index: EXTIndex,
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
