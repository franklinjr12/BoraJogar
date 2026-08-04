declare module 'node:fs' {
  export function readFileSync(path: string): Buffer;
}

type Buffer = Uint8Array;
