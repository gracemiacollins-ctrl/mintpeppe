import * as React from 'react'
import { modal } from '../appkit'

type WalletState = {
  connected: boolean
  address: string
  refresh: () => Promise<void>
  connect: () => Promise<void>
  disconnect: () => Promise<void>
}

export function useWalletStatus(): WalletState {
  const [connected, setConnected] = React.useState(false)
  const [address, setAddress] = React.useState('')

  const refresh = React.useCallback(async () => {
    try {
      const addr = await (modal as any)?.getAddress?.()
      if (addr && typeof addr === 'string') {
        setConnected(true)
        setAddress(addr)
      } else {
        setConnected(false)
        setAddress('')
      }
    } catch {
      setConnected(false)
      setAddress('')
    }
  }, [])

  const connect = React.useCallback(async () => {
    try {
      await (modal as any)?.open?.()
      await refresh()
    } catch {}
  }, [refresh])

  const disconnect = React.useCallback(async () => {
    try {
      await (modal as any)?.disconnect?.()
    } finally {
      await refresh()
    }
  }, [refresh])

  React.useEffect(() => {
    refresh()
    const onFocus = () => { refresh() }
    window.addEventListener('focus', onFocus)

    const anyModal: any = modal as any
    const unsubConnect = anyModal?.subscribe?.('connect', refresh)
    const unsubDisconnect = anyModal?.subscribe?.('disconnect', refresh)
    const unsubSession = anyModal?.subscribe?.('session_update', refresh)

    return () => {
      window.removeEventListener('focus', onFocus)
      unsubConnect?.()
      unsubDisconnect?.()
      unsubSession?.()
    }
  }, [refresh])

  return { connected, address, refresh, connect, disconnect }
}
