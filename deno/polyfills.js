/* global Deno */

import { Buffer } from 'https://deno.land/std@0.132.0/node/buffer.ts'

const events = () => ({ data: [], error: [], drain: [], connect: [], secureConnect: [], close: [] })

export const net = {
  createServer() {
    const server =  {
      address() {
        return { port: 9876 }
      },
      async listen() {
        server.raw = Deno.listen({ port: 9876, transport: 'tcp' })
        for await (const conn of server.raw)
          setTimeout(() => conn.close(), 500)
      },
      close() {
        server.raw.close()
      }
    }
    return server
  },
  Socket() {
    let paused
      , resume

    const socket = {
      error,
      success,
      connect: (...xs) => {
        socket.closed = false
        socket.raw = null
        xs.length === 1
          ? Deno.connect({ transport: 'unix', path: xs[0] }).then(success, error)
          : Deno.connect({ transport: 'tcp', port: socket.port = xs[0], hostname: socket.hostname = xs[1] }).then(success, error)
      },
      pause: () => {
        paused = new Promise(r => resume = r)
      },
      resume: () => {
        resume && resume()
        paused = null
      },
      isPaused: () => !!paused,
      removeAllListeners: () => socket.events = events(),
      events: events(),
      raw: null,
      on: (x, fn) => socket.events[x].push(fn),
      once: (x, fn) => {
        if (x === 'data')
          socket.break = true
        const e = socket.events[x]
        e.push(once)
        once.once = fn
        function once(...args) {
          fn(...args)
          e.indexOf(once) > -1 && e.splice(e.indexOf(once), 1)
        }
      },
      removeListener: (x, fn) => {
        socket.events[x] = socket.events[x].filter(x => x !== fn && x.once !== fn)
      },
      write: (x, cb) => {
        socket.raw.write(x)
          .then(() => (cb && cb(null)))
          .catch(err => {
            cb && cb()
            call(socket.events.error, err)
          })
        return false
      },
      destroy: () => close(true),
      end: close
    }

    return socket

    async function success(raw) {
      const encrypted = socket.encrypted
      socket.raw = raw
      socket.encrypted
        ? call(socket.events.secureConnect)
        : call(socket.events.connect)

      const b = new Uint8Array(1024)
      let result

      try {
        while ((result = !socket.closed && await raw.read(b))) {
          call(socket.events.data, Buffer.from(b.subarray(0, result)))
          if (!encrypted && socket.break && (socket.break = false, b[0] === 83))
            return socket.break = false
          paused && await paused
        }
      } catch (e) {
        if (e instanceof Deno.errors.BadResource === false)
          error(e)
      }

      if (!socket.encrypted || encrypted)
        close()
    }

    function close() {
      try {
        socket.raw && socket.raw.close()
      } catch (e) {
        if (e instanceof Deno.errors.BadResource === false)
          call(socket.events.error, e)
      }
      closed()
    }

    function closed() {
      socket.break = socket.encrypted = false
      if (socket.closed)
        return

      call(socket.events.close)
      socket.closed = true
    }

    function error(err) {
      call(socket.events.error, err)
      socket.raw
        ? close()
        : closed()
    }

    function call(xs, x) {
      xs.slice().forEach(fn => fn(x))
    }
  }
}

export const tls = {
  connect({ socket, ...options }) {
    socket.encrypted = true
    Deno.startTls(socket.raw, { hostname: socket.hostname, ...options })
      .then(socket.success, socket.error)
    socket.raw = null
    return socket
  }
}

let ids = 1
const tasks = new Set()
export const setImmediate = fn => {
  const id = ids++
  tasks.add(id)
  queueMicrotask(() => {
    if (tasks.has(id)) {
      fn()
      tasks.delete(id)
    }
  })
  return id
}

export const clearImmediate = id => tasks.delete(id)

