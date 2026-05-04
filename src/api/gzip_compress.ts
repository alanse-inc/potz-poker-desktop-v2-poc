import { gzip } from "pako";

export function gzipCompress(data: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(gzip(data).buffer as ArrayBuffer);
}
