import type React from "react";
import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useNavigate } from "react-router-dom";
import { ContextFlood } from "./bugs/ContextFlood.js";
import { InfiniteUpdater } from "./bugs/InfiniteUpdater.js";
import { LeakyInterval } from "./bugs/LeakyInterval.js";
import { StalePrice } from "./bugs/StalePrice.js";
import { Navbar } from "./components/Navbar.js";
import { Cart } from "./pages/Cart.js";
import { Checkout } from "./pages/Checkout.js";
import { Home } from "./pages/Home.js";
import { Login } from "./pages/Login.js";
import { ProductDetail } from "./pages/ProductDetail.js";

declare global {
	interface Window {
		__SPA_NAVIGATE__?: (path: string) => void;
	}
}

/** Expose React Router's navigate function globally for test automation. */
function NavigateExposer() {
	const navigate = useNavigate();
	useEffect(() => {
		window.__SPA_NAVIGATE__ = (path: string) => navigate(path);
	}, [navigate]);
	return null;
}

const BUG_COMPONENTS: Record<string, React.FC> = {
	"infinite-updater": InfiniteUpdater,
	"stale-price": StalePrice,
	"leaky-interval": LeakyInterval,
	"context-flood": ContextFlood,
};

function BugRoute() {
	const name = window.location.pathname.split("/bugs/")[1] ?? "";
	const Component = BUG_COMPONENTS[name];
	if (!Component) return <div>Unknown bug: {name}</div>;
	return <Component />;
}

function App() {
	return (
		<BrowserRouter>
			<NavigateExposer />
			<Navbar />
			<main style={{ padding: "1rem" }}>
				<Routes>
					<Route path="/" element={<Home />} />
					<Route path="/product/:id" element={<ProductDetail />} />
					<Route path="/cart" element={<Cart />} />
					<Route path="/checkout" element={<Checkout />} />
					<Route path="/login" element={<Login />} />
					<Route path="/bugs/:name" element={<BugRoute />} />
				</Routes>
			</main>
		</BrowserRouter>
	);
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
