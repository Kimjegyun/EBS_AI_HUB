import { Worker } from 'worker_threads'
import type { WorkBook, ParsingOptions } from 'xlsx'

export function validateWorkbookSize(buffer: Buffer): void {
  if (buffer.length < 4) throw new Error('비어 있거나 손상된 엑셀 파일입니다.')
  if (buffer.length > 20 * 1024 * 1024) throw new Error('엑셀 파일은 20MB 이하여야 합니다.')
  if (buffer.readUInt16LE(0) !== 0x4b50) return // Legacy XLS and CSV are parsed in the bounded worker too.
  let end = -1
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { end = i; break }
  }
  if (end < 0) throw new Error('손상된 엑셀 압축 파일입니다.')
  const count = buffer.readUInt16LE(end + 10)
  let offset = buffer.readUInt32LE(end + 16), expanded = 0
  if (count > 4096) throw new Error('엑셀 내부 파일 수가 너무 많습니다.')
  for (let n = 0; n < count; n++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('엑셀 압축 구조가 잘못되었습니다.')
    const size = buffer.readUInt32LE(offset + 24)
    expanded += size
    if (size === 0xffffffff || expanded > 100 * 1024 * 1024) throw new Error('압축 해제 후 엑셀 크기 제한(100MB)을 초과했습니다.')
    offset += 46 + buffer.readUInt16LE(offset + 28) + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32)
  }
}

let active = 0
/** Never parse untrusted spreadsheets on the HTTP event loop. */
export async function readWorkbook(buffer: Buffer, options: ParsingOptions = {}): Promise<WorkBook> {
  if (buffer.length < 4) throw new Error('비어 있거나 손상된 엑셀 파일입니다.')
  validateWorkbookSize(buffer)
  if (active >= 2) throw new Error('엑셀 처리 중입니다. 잠시 후 다시 시도하세요.')
  active++
  try {
    return await new Promise<WorkBook>((resolve, reject) => {
      const worker = new Worker(`
        const {parentPort,workerData}=require('worker_threads');
        const XLSX=require(workerData.module);
        try {
          const wb=XLSX.read(Buffer.from(workerData.buffer),{...workerData.options,type:'buffer',cellFormula:false,cellHTML:false,bookVBA:false});
          if(wb.SheetNames.length>64)throw Error('시트 수 제한(64개)을 초과했습니다.');
          let cells=0;
          for(const sheet of Object.values(wb.Sheets||{})) {
            if(!sheet['!ref'])continue;
            const range=XLSX.utils.decode_range(sheet['!ref']);
            cells+=(range.e.r+1)*(range.e.c+1);
            if(range.e.r>=100000 || range.e.c>=512 || cells>2000000)throw Error('엑셀 행·열·셀 수 제한을 초과했습니다.');
          }
          parentPort.postMessage({workbook:wb});
        }catch(e){parentPort.postMessage({error:e.message});}
      `, { eval: true, workerData: { module: require.resolve('xlsx'), buffer, options }, resourceLimits: { maxOldGenerationSizeMb: 256, stackSizeMb: 4 } })
      const timer = setTimeout(() => { void worker.terminate(); reject(new Error('엑셀 처리 제한 시간(15초)을 초과했습니다.')) }, 15000)
      worker.once('message', (data) => {
        clearTimeout(timer); void worker.terminate()
        if (data.error) reject(new Error(data.error)); else resolve(data.workbook)
      })
      worker.once('error', () => { clearTimeout(timer); reject(new Error('엑셀 처리 리소스 제한을 초과했습니다.')) })
      worker.once('exit', (code) => { clearTimeout(timer); if (code !== 0) reject(new Error('엑셀 처리가 중단되었습니다.')) })
    })
  } finally { active-- }
}
