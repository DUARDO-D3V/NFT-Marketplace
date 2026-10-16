import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { marketSocket } from "../realtime";
import { resetMockState } from "./handlers";

// Demo-only control: lives in the mock layer so the application code carries no scenario logic.
export default function DemoControls() {
  const queryClient = useQueryClient();
  const [scenario, setScenario] = useState(() => localStorage.getItem("kurio:scenario") ?? "standard");

  useEffect(() => {
    const sync = () => setScenario(localStorage.getItem("kurio:scenario") ?? "standard");
    window.addEventListener("kurio:scenario-reset", sync);
    return () => window.removeEventListener("kurio:scenario-reset", sync);
  }, []);

  return (
    <label className="scenario-picker"><span>DEMO</span><select aria-label="Cenário de demonstração" value={scenario} onChange={(event) => { const value = event.target.value; if (value === "reset") { resetMockState(); window.location.assign("/"); return; } if (value === "price-change") { localStorage.setItem("kurio:scenario", "standard"); setScenario("standard"); marketSocket.emit("mock.nft.update", { id: "emerald-ape-042", price: "1.23" }); return; } localStorage.setItem("kurio:scenario", value); setScenario(value); void queryClient.invalidateQueries(); }}><option value="standard">Normal</option><option value="slow">Rede lenta</option><option value="offline">Sem conexão</option><option value="catalog-error">Erro no catálogo</option><option value="coupon-expired">Cupom expirado</option><option value="payment-declined">Pagamento recusado</option><option value="session-expired">Sessão expirada no pagamento</option><option value="quote-changed-before-order">Preço muda ao confirmar</option><option value="order-timeout">Timeout após pedido</option><option value="price-change">Alterar preço via Socket.IO</option><option value="variable-latency">Latência variável</option><option value="out-of-order">Respostas fora de ordem</option><option value="empty-catalog">Catálogo vazio</option><option value="sold-out-before-order">Esgota ao confirmar</option><option value="session-revoked">Sess&#227;o revogada (401)</option><option value="forbidden">Sem permissão (403)</option><option value="favorites-error">Falha ao favoritar</option><option value="live-prices">Pre&#231;os ao vivo</option><option value="transient-failure">Falha transitória</option><option value="reset">Reiniciar demonstração</option></select></label>
  );
}