import { useMemo } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";

import { Dashboard } from "./pages/Dashboard";
import { MyPositions } from "./pages/MyPositions";
import { WalletButton } from "./components/WalletButton";
import { NETWORK } from "./utils/constants";

import "@solana/wallet-adapter-react-ui/styles.css";
import "./App.css";

function App() {
  // Use localnet for development
  const endpoint = NETWORK;

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <BrowserRouter>
            <div className="app">
              <nav className="navbar">
                <div className="nav-left">
                  <h1>Lending Protocol</h1>
                  <div className="nav-links">
                    <Link to="/">Dashboard</Link>
                    <Link to="/my-positions">My Positions</Link>
                  </div>
                </div>
                <div className="nav-right">
                  <WalletButton />
                </div>
              </nav>

              <main className="main-content">
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/my-positions" element={<MyPositions />} />
                </Routes>
              </main>
            </div>
          </BrowserRouter>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export default App;