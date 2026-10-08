// Encrypts a secret (the AI API key) before it is stored in the database, with a key derived from
// PAYLOAD_SECRET (server env, never in the database or the repo). A database dump alone does not
// reveal the API key.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const keyOf = (secret: string) => createHash('sha256').update(`njmc-secret-box:${secret}`).digest()

export function seal(plain: string, secret = process.env.PAYLOAD_SECRET || ''): string {
  if (!secret) throw new Error('PAYLOAD_SECRET is not set')
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', keyOf(secret), iv)
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), body.toString('base64')].join(':')
}

export function open(sealed: string | null | undefined, secret = process.env.PAYLOAD_SECRET || ''): string | null {
  const p = String(sealed ?? '').split(':')
  if (p.length !== 4 || p[0] !== 'v1' || !secret) return null
  try {
    const d = createDecipheriv('aes-256-gcm', keyOf(secret), Buffer.from(p[1], 'base64'))
    d.setAuthTag(Buffer.from(p[2], 'base64'))
    return Buffer.concat([d.update(Buffer.from(p[3], 'base64')), d.final()]).toString('utf8')
  } catch {
    return null
  }
}

// "sk-ant-api03-...wxyz": enough to tell keys apart, never enough to use one.
export const keyHint = (k: string) => `${k.slice(0, 7)}...${k.slice(-4)}`
