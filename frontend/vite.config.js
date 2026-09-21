import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  // Where `vite dev` forwards /api to. This is the dev-time counterpart of the
  // nginx `location /api/` block in deploy/nginx/ — both exist so the browser
  // only ever talks to one origin. See the header comment in src/lib/api.js.
  //
  // Deliberately NOT VITE_API_URL: that is a browser-side path (`/api`), not a
  // server address, and using it here would try to proxy to a relative URL.
  const apiProxyTarget = (env.API_PROXY_TARGET || "http://localhost:5000").replace(/\/+$/, "");

  return {
    plugins: [
      react({
        babel: {
          plugins: [["babel-plugin-react-compiler", {}]],
        },
      }),
      tailwindcss(),
    ],

    server: {
      proxy: {
        // One rule covers both the session endpoints and the rest of the API,
        // because stripping `/api` is all either of them needs:
        //   /api/auth/login → /auth/login      /api/requests → /requests
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
  };
});