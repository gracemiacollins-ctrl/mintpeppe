
// was: import { useWalletStatus } from '@/hooks/useWalletStatus'
import { useWalletStatus } from '../hooks/useWalletStatus'


export function WalletButton({
  whenConnectedText,
  whenDisconnectedText = 'Connect Wallet',
  onConnectedClick,
  className = '',
  disableWhenConnected = true
}: {
  whenConnectedText: string
  whenDisconnectedText?: string
  onConnectedClick?: () => void
  className?: string
  disableWhenConnected?: boolean
}) {
  const { connected, connect } = useWalletStatus()

  const onClick = async () => {
    if (connected) {
      if (onConnectedClick) return onConnectedClick()
      return
    } else {
      await connect()
    }
  }

  return (
    <button
      className={'px-4 py-2 rounded-2xl shadow ' + className}
      onClick={onClick}
      disabled={disableWhenConnected && connected}
      aria-disabled={disableWhenConnected && connected}
    >
      {connected ? whenConnectedText : whenDisconnectedText}
    </button>
  )
}
