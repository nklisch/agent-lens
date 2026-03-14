import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react()],
	build: {
		outDir: "dist",
		// No minification: preserves component function names for framework observer testing
		minify: false,
		sourcemap: true,
	},
	server: {
		port: 5173,
	},
});
