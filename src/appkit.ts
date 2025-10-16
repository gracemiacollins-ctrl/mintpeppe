import { createAppKit } from '@reown/appkit/react'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { SolanaAdapter } from '@reown/appkit-adapter-solana/react'
import { QueryClient } from '@tanstack/react-query'
import { mainnet, sepolia } from 'wagmi/chains'
import { solana as solanaMainnet, solanaDevnet } from '@reown/appkit/networks'
import { REOWN_PROJECT_ID } from './config'

export const queryClient = new QueryClient()

const evmNetworks = [mainnet, sepolia]
const solNetworks = [solanaMainnet /*, solanaDevnet*/]

export const wagmiAdapter = new WagmiAdapter({
  projectId: REOWN_PROJECT_ID || 'MISSING_PROJECT_ID',
  networks: evmNetworks
})

export const solanaAdapter = new SolanaAdapter()

export const modal = createAppKit({
  projectId: REOWN_PROJECT_ID || 'MISSING_PROJECT_ID',
  adapters: [wagmiAdapter, solanaAdapter],
  networks: [...evmNetworks, ...solNetworks],
  metadata: {
    name: 'wallconnec',
    description: 'EVM + Solana',
    url: 'https://peppermint2.com/',
    icons: ['https://avatars.githubusercontent.com/u/37784886']
  },
  features: { analytics: false }
})
