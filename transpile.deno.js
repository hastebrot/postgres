import fs from 'fs'
import path from 'path'

const empty = x => fs.readdirSync(x).forEach(f => fs.unlinkSync(path.join(x, f)))
    , ensureEmpty = x => !fs.existsSync(x) ? fs.mkdirSync(x) : empty(x)
    , root = 'deno'
    , src = path.join(root, 'src')
    , types = path.join(root, 'types')
    , tests = path.join(root, 'tests')

ensureEmpty(src)
ensureEmpty(types)
ensureEmpty(tests)

fs.writeFileSync(path.join(types, 'index.d.ts'), fs.readFileSync(path.join('types', 'index.d.ts')))
fs.writeFileSync(
  path.join(root, 'README.md'),
  fs.readFileSync('README.md', 'utf8')
    .replace(/### Installation(\n.*){4}/, '')
    .replace(
      'import postgres from \'postgres\'',
      'import postgres from \'https://deno.land/x/postgresjs/mod.js\''
    )
)

fs.readdirSync('src').forEach(name =>
  fs.writeFileSync(
    path.join(src, name),
    transpile(fs.readFileSync(path.join('src', name), 'utf8'), name, 'src')
  )
)

fs.readdirSync('tests').forEach(name =>
  fs.writeFileSync(
    path.join(tests, name),
    name.endsWith('.js')
      ? transpile(fs.readFileSync(path.join('tests', name), 'utf8'), name, 'tests')
      : fs.readFileSync(path.join('tests', name), 'utf8')
  )
)

fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ type: 'commonjs' }))

function transpile(x, name, folder) {
  if (folder === 'tests') {
    if (name === 'bootstrap.js') {
      x = x.replace('export function exec(', 'function ignore(')
           .replace('async function execAsync(', 'export async function exec(')
           .replace(/\nexec\(/g, '\nawait exec(')
           .replace('{ spawnSync }', '{ spawn }')
    }

    if (name === 'index.js') {
      // Ignore tests that use node create stream functions not supported in deno yet
      x = x.replace(/(t\('Copy from file works)/, 'n$1')
           .replace(/(t\('Copy from abort works)/, 'n$1')
           .replace(/(t\('Large object)/, 'n$1')
    }
  }

  const buffer = x.includes('Buffer')
    ? 'import { Buffer } from \'https://deno.land/std@0.132.0/node/buffer.ts\'\n'
    : ''

  const process = x.includes('process.')
    ? 'import process from \'https://deno.land/std@0.132.0/node/process.ts\'\n'
    : ''

  const timers = x.includes('setImmediate')
    ? 'import { setImmediate, clearImmediate } from \'../polyfills.js\'\n'
    : ''

  const hmac = x.includes('createHmac')
    ? 'import { HmacSha256 } from \'https://deno.land/std@0.132.0/hash/sha256.ts\'\n'
    : ''

  return hmac + buffer + process + timers + x
    .replace(/setTimeout\((.*)\)\.unref\(\)/g, '(window.timer = setTimeout($1), Deno.unrefTimer(window.timer), window.timer)')
    .replace(
      'crypto.createHmac(\'sha256\', key).update(x).digest()',
      'Buffer.from(new HmacSha256(key).update(x).digest())'
    )
    .replace(
      'query.writable.push({ chunk, callback })',
      '(query.writable.push({ chunk }), callback())'
    )
    .replace(/.setKeepAlive\([^)]+\)/g, '')
    .replace(/import net from 'net'/, 'import { net } from \'../polyfills.js\'')
    .replace(/import tls from 'tls'/, 'import { tls } from \'../polyfills.js\'')
    .replace(/ from '([a-z_]+)'/g, ' from \'https://deno.land/std@0.132.0/node/$1.ts\'')
}
