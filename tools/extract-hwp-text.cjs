const fs = require('fs')
const zlib = require('zlib')

const FREE = 0xffffffff
const END = 0xfffffffe

function u16(b, o) { return b.readUInt16LE(o) }
function u32(b, o) { return b.readUInt32LE(o) }
function sectorOffset(sec, size) { return (sec + 1) * size }

function readOle(file) {
  const b = fs.readFileSync(file)
  const sectorSize = 1 << u16(b, 0x1e)
  const miniSectorSize = 1 << u16(b, 0x20)
  const dirStart = u32(b, 0x30)
  const miniCutoff = u32(b, 0x38)
  const miniFatStart = u32(b, 0x3c)
  const miniFatCount = u32(b, 0x40)
  const difatStart = u32(b, 0x44)
  const difatCount = u32(b, 0x48)

  const difat = []
  for (let i = 0; i < 109; i++) {
    const v = u32(b, 0x4c + i * 4)
    if (v !== FREE) difat.push(v)
  }
  let nextDifat = difatStart
  for (let i = 0; i < difatCount && nextDifat !== END && nextDifat !== FREE; i++) {
    const off = sectorOffset(nextDifat, sectorSize)
    const entries = sectorSize / 4 - 1
    for (let j = 0; j < entries; j++) {
      const v = u32(b, off + j * 4)
      if (v !== FREE) difat.push(v)
    }
    nextDifat = u32(b, off + entries * 4)
  }

  const fat = []
  for (const sec of difat) {
    const off = sectorOffset(sec, sectorSize)
    for (let i = 0; i < sectorSize / 4; i++) fat.push(u32(b, off + i * 4))
  }

  function readChain(start) {
    const chunks = []
    let sec = start
    const seen = new Set()
    while (sec !== END && sec !== FREE && !seen.has(sec)) {
      seen.add(sec)
      chunks.push(b.subarray(sectorOffset(sec, sectorSize), sectorOffset(sec, sectorSize) + sectorSize))
      sec = fat[sec]
    }
    return Buffer.concat(chunks)
  }

  const dirBuf = readChain(dirStart)
  const entries = []
  for (let off = 0; off + 128 <= dirBuf.length; off += 128) {
    const nameLen = u16(dirBuf, off + 64)
    if (nameLen < 2) continue
    const name = dirBuf.subarray(off, off + nameLen - 2).toString('utf16le')
    const type = dirBuf[off + 66]
    const start = u32(dirBuf, off + 116)
    const size = Number(dirBuf.readBigUInt64LE(off + 120))
    entries.push({ name, type, start, size })
  }

  const root = entries.find(e => e.type === 5)
  const miniStream = root ? readChain(root.start).subarray(0, root.size) : Buffer.alloc(0)
  const miniFat = []
  if (miniFatStart !== FREE && miniFatStart !== END && miniFatCount > 0) {
    const miniFatBuf = readChain(miniFatStart)
    for (let i = 0; i < miniFatBuf.length / 4; i++) miniFat.push(u32(miniFatBuf, i * 4))
  }

  function readMiniChain(start, size) {
    const chunks = []
    let sec = start
    const seen = new Set()
    while (sec !== END && sec !== FREE && !seen.has(sec)) {
      seen.add(sec)
      const off = sec * miniSectorSize
      chunks.push(miniStream.subarray(off, off + miniSectorSize))
      sec = miniFat[sec]
    }
    return Buffer.concat(chunks).subarray(0, size)
  }

  function stream(entry) {
    if (entry.size < miniCutoff && entry.type !== 5) return readMiniChain(entry.start, entry.size)
    return readChain(entry.start).subarray(0, entry.size)
  }

  return { entries, stream }
}

function hwpText(file) {
  const ole = readOle(file)
  const headerEntry = ole.entries.find(e => e.name === 'FileHeader')
  const header = headerEntry ? ole.stream(headerEntry) : Buffer.alloc(0)
  const compressed = header.length > 39 ? !!(header.readUInt32LE(36) & 1) : true
  const sections = ole.entries
    .filter(e => /^Section\d+$/.test(e.name) || /^BodyText\/Section\d+$/.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name))
  const out = []
  for (const sec of sections) {
    let data = ole.stream(sec)
    if (compressed) {
      try { data = zlib.inflateRawSync(data) } catch {}
    }
    let p = 0
    while (p + 4 <= data.length) {
      const h = data.readUInt32LE(p); p += 4
      const tag = h & 0x3ff
      let size = h >>> 20
      if (size === 0xfff) {
        if (p + 4 > data.length) break
        size = data.readUInt32LE(p); p += 4
      }
      if (p + size > data.length) break
      if (tag === 67) {
        const text = data.subarray(p, p + size)
          .toString('utf16le')
          .replace(/[\u0000-\u001f]+/g, ' ')
          .trim()
        if (text) out.push(text)
      }
      p += size
    }
  }
  return out.join('\n')
}

for (const file of process.argv.slice(2)) {
  console.log(`\n===== ${file} =====`)
  console.log(hwpText(file).slice(0, 6000))
}
