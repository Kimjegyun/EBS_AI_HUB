// iOS Safari has no native BarcodeDetector, so html5-qrcode falls back to ZXing-js,
// which rarely reads 1D asset barcodes (Code 128/39). Install the zxing-cpp (WASM)
// polyfill only where the native detector is missing; Android keeps its built-in one.
// Must load before `new Html5Qrcode`, which checks `"BarcodeDetector" in window` once.
import { setZXingModuleOverrides } from 'barcode-detector/polyfill'
import zxingReaderWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

// Serve the WASM from this app instead of the default CDN.
setZXingModuleOverrides({
  locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? zxingReaderWasmUrl : prefix + path),
})
