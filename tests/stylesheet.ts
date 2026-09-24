// The stylesheet as the browser gets it: `src/index.css` with each of its parts
// inlined where it is imported, in the same order. What every test that reads
// the CSS reads, so none of them has to know it is in parts.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = resolve(process.cwd(), 'src')

export function stylesheet(): string {
  return readFileSync(resolve(SRC, 'index.css'), 'utf8').replace(
    /@import '\.\/(styles\/[\w-]+\.css)';/g,
    (_, part) => readFileSync(resolve(SRC, part), 'utf8'),
  )
}
