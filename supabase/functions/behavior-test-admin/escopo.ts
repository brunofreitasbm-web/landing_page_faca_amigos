// Nível do Hub (fa_gestao_permissoes.nivel) -> escopo da sessão do /admin.
// Falha fechado: só "admin" vira owner. Ticket sem nível (null/undefined) ou com valor desconhecido
// não ganha acesso nenhum, em vez de virar dono do painel.
export type Escopo = "owner" | "equipe" | "ver" | "nenhum";

export function escopoDoNivel(nivel: unknown): Escopo {
  if (nivel === "admin") return "owner";
  if (nivel === "operar") return "equipe";
  if (nivel === "ver") return "ver";
  return "nenhum";
}
