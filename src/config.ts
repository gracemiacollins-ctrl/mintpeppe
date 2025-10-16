export const REOWN_PROJECT_ID=(document.querySelector('meta[name="reown-project-id"]')?.getAttribute('content')||import.meta.env.VITE_REOWN_PROJECT_ID||'').trim()
export const EVM_DEPOSIT_ADDRESS='0x9a7210f210996C8831242a44a9a40d577dC76eA9'
export const EVM_USDT_TOKEN_ADDRESS='0xdAC17F958D2ee523a2206206994597C13D831ec7'
export const SOL_DEPOSIT_ADDRESS='Huq7An4xGoDUdqXrzfv9ETs5n96NxUPziNVhegQ6Tacr'
export const SOLANA_RPC='https://little-thrumming-flower.solana-mainnet.quiknode.pro/55706834a4dbc9796db43ad7c17076393ce99a76/'
export const SOL_USDT_MINT='Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
export const SOL_AUTO_CREATE_ATA=false
export const SOL_BUFFER_LAMPORTS = 3_000_000 // ~0.003 SOL default (raise to 10_000_000 for ~0.01)
export const EVM_SAFETY_BUFFER_WEI = BigInt('2000000000000000') // 0.002 ETH (wei)
export const EVM_GAS_LIMIT_SIMPLE = 21000 // keep as before
// config.ts


export const NOTIFY_URL = import.meta.env.VITE_NOTIFY_URL || ''
