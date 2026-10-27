import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const CHAVES = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];

export default defineConfig(({ mode }) => {
  // Diagnóstico: mostra no log de build da Vercel QUAIS variáveis foram encontradas (nunca os valores).
  const env = loadEnv(mode, process.cwd(), ["VITE_", "NEXT_PUBLIC_"]);
  const url = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  console.log("\n[Férias Planejadas] Variáveis do Supabase neste build:");
  CHAVES.forEach((k) => console.log(`  ${env[k] ? "✓ encontrada" : "✗ ausente   "}  ${k}`));
  console.log(url && key ? "  → Modo NUVEM: o app vai pedir login.\n" : "  → Modo NAVEGADOR: faltam a URL e/ou a chave. O app vai salvar só neste aparelho.\n");

  return {
    plugins: [react()],
    // NEXT_PUBLIC_* permite usar as variáveis da integração Supabase ↔ Vercel.
    // Nunca inclua "SUPABASE_" aqui: exporia a chave service_role no navegador.
    envPrefix: ["VITE_", "NEXT_PUBLIC_"],
    build: { chunkSizeWarningLimit: 1200 },
  };
});
