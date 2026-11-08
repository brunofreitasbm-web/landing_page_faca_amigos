// Supabase em memória, só o que a função gestao-hub usa (consulta encadeada + auth.admin).
// Cada URL é um "projeto" (A = SUPABASE_URL, B = CLINICA_SUPABASE_URL) com suas tabelas e usuários de login.
// Serve apenas para os testes de supabase/tests/gestao-hub; a função de produção importa o supabase-js de verdade.

type Linha = Record<string, any>;

export type UsuarioFake = {
  id: string;
  email: string;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
  created_at: string;
  last_sign_in_at: string | null;
  banned_until: string | null;
  /** Só para os testes conferirem que uma senha foi definida; nunca é lida pela função. */
  password?: string;
};

export class Projeto {
  tabelas: Record<string, Linha[]> = {};
  usuarios: UsuarioFake[] = [];
  /** Imita o gatilho da Clínica: todo login novo ganha um perfil 'terapeuta'. */
  gatilhoPerfil = false;
  chamadas: string[] = [];
  /** JWTs válidos deste projeto: token -> id do usuário (imita auth.getUser(jwt)). */
  tokens: Record<string, string> = {};
  /** Sessões abertas por id de usuário (imita auth.sessions). */
  sessoes: Record<string, number> = {};
  /** Tabelas que respondem com erro (ex.: migração ainda não aplicada). */
  tabelasComErro = new Set<string>();
  /** Operações pontuais que falham, no formato "upsert:profiles". */
  operacoesComErro = new Set<string>();
  /** Gancho por tabela, chamado logo antes de um insert gravar (injeta linhas "concorrentes"). */
  antesDoInsert: Record<string, () => void> = {};
  /** URLs assinadas pedidas ao Storage (imita storage.from(bucket).createSignedUrl). */
  assinaturas: Array<{ bucket: string; path: string; seconds: number; download: string | boolean | undefined }> = [];
  tabela(nome: string): Linha[] {
    return (this.tabelas[nome] ??= []);
  }
}

export const projetos: Record<string, Projeto> = {};
export function projeto(url: string): Projeto {
  return (projetos[url] ??= new Projeto());
}
export function reiniciar() {
  for (const k of Object.keys(projetos)) delete projetos[k];
}

type Op = "select" | "insert" | "update" | "delete" | "upsert";

class Consulta implements PromiseLike<{ data: any; error: { message: string } | null }> {
  private op: Op = "select";
  private filtros: Array<(l: Linha) => boolean> = [];
  private payload: Linha | Linha[] | null = null;
  private onConflict: string[] = [];
  private ignorarDuplicata = false;
  private modo: "lista" | "unica" | "talvez" = "lista";
  private limite: number | null = null;
  private retorna = false;
  private contar = false;
  private cabeca = false;

  constructor(private p: Projeto, private nome: string) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op !== "select") this.retorna = true;
    if (opts?.count) this.contar = true;
    if (opts?.head) this.cabeca = true;
    return this;
  }
  insert(v: Linha | Linha[]) { this.op = "insert"; this.payload = v; return this; }
  update(v: Linha) { this.op = "update"; this.payload = v; return this; }
  upsert(v: Linha | Linha[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.op = "upsert";
    this.ignorarDuplicata = opts?.ignoreDuplicates === true;
    this.payload = v;
    this.onConflict = (opts?.onConflict ?? "").split(",").map((c) => c.trim()).filter(Boolean);
    return this;
  }
  delete() { this.op = "delete"; return this; }
  eq(c: string, v: unknown) { this.filtros.push((l) => l[c] === v); return this; }
  // Como no Postgres, `neq` não casa linha com a coluna nula.
  neq(c: string, v: unknown) { this.filtros.push((l) => l[c] != null && l[c] !== v); return this; }
  // Como no Postgres: `%` é curinga; sem `%` vira comparação exata (sem diferenciar maiúsculas).
  ilike(c: string, v: string) {
    const re = new RegExp("^" + v.split("%").map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$", "i");
    this.filtros.push((l) => re.test(String(l[c] ?? "")));
    return this;
  }
  is(c: string, v: unknown) { this.filtros.push((l) => (v === null ? l[c] == null : l[c] === v)); return this; }
  gt(c: string, v: unknown) { this.filtros.push((l) => String(l[c] ?? "") > String(v)); return this; }
  gte(c: string, v: unknown) { this.filtros.push((l) => String(l[c] ?? "") >= String(v)); return this; }
  in(c: string, vs: unknown[]) { this.filtros.push((l) => vs.includes(l[c])); return this; }
  or(expr: string) {
    // email.eq."x",login_email.eq."x"
    const partes = expr.split(",").map((t) => /^(\w+)\.eq\.(?:"(.*)"|(.*))$/.exec(t.trim())).filter(Boolean) as RegExpExecArray[];
    this.filtros.push((l) => partes.some((m) => l[m[1]] === (m[2] ?? m[3])));
    return this;
  }
  order(_c: string, _o?: unknown) { return this; }
  limit(n: number) { this.limite = n; return this; }
  maybeSingle() { this.modo = "talvez"; return this; }
  single() { this.modo = "unica"; return this; }

  then<T1, T2>(ok?: (v: { data: any; count?: number; error: { message: string } | null }) => T1 | PromiseLike<T1>, ko?: (e: unknown) => T2 | PromiseLike<T2>) {
    return Promise.resolve(this.executar()).then(ok, ko);
  }

  private executar(): { data: any; count?: number; error: { message: string } | null } {
    this.p.chamadas.push(`${this.op}:${this.nome}`);
    if (this.p.operacoesComErro.has(`${this.op}:${this.nome}`)) return { data: null, error: { message: `falha simulada em ${this.op}:${this.nome}` } };
    if (this.p.tabelasComErro.has(this.nome)) return { data: null, error: { message: `relation "${this.nome}" does not exist` } };
    if (this.op === "insert") this.p.antesDoInsert[this.nome]?.();
    const t = this.p.tabela(this.nome);
    const casa = (l: Linha) => this.filtros.every((f) => f(l));
    let afetadas: Linha[] = [];

    if (this.op === "insert" || this.op === "upsert") {
      const novas = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map((l) => ({ ...l }));
      for (const nova of novas) {
        if (this.op === "upsert" && this.onConflict.length) {
          const ex = t.find((l) => this.onConflict.every((c) => l[c] === nova[c]));
          if (ex) { if (!this.ignorarDuplicata) { Object.assign(ex, nova); afetadas.push(ex); } continue; }
        }
        if (nova.id === undefined) nova.id = crypto.randomUUID();
        if (nova.created_at === undefined) nova.created_at = new Date().toISOString(); // como o default now() do banco
        t.push(nova);
        afetadas.push(nova);
      }
    } else if (this.op === "update") {
      afetadas = t.filter(casa);
      for (const l of afetadas) Object.assign(l, this.payload);
    } else if (this.op === "delete") {
      afetadas = t.filter(casa);
      this.p.tabelas[this.nome] = t.filter((l) => !casa(l));
    } else {
      afetadas = t.filter(casa);
    }

    if (this.op === "select" && this.contar && this.cabeca) return { data: null, count: afetadas.length, error: null };
    const devolve = this.op === "select" || this.retorna ? afetadas.map((l) => ({ ...l })) : null;
    if (this.limite !== null && devolve) devolve.splice(this.limite);
    if (devolve === null) return { data: null, error: null };
    if (this.modo === "talvez") return { data: devolve[0] ?? null, error: null };
    if (this.modo === "unica") {
      return devolve.length === 1 ? { data: devolve[0], error: null } : { data: null, error: { message: "esperava 1 linha" } };
    }
    return { data: devolve, error: null };
  }
}

function adminAuth(p: Projeto) {
  const achar = (id: string) => p.usuarios.find((u) => u.id === id);
  return {
    async getUser(jwt: string) {
      p.chamadas.push("auth.getUser");
      const u = p.usuarios.find((x) => x.id === p.tokens[jwt]);
      return u ? { data: { user: { ...u } }, error: null } : { data: { user: null }, error: { message: "jwt inválido" } };
    },
    async listUsers(opts?: { page?: number; perPage?: number }) {
      p.chamadas.push("auth.listUsers");
      const pagina = opts?.page ?? 1;
      const por = opts?.perPage ?? 50;
      return { data: { users: p.usuarios.slice((pagina - 1) * por, pagina * por).map((u) => ({ ...u })) }, error: null };
    },
    async createUser(attrs: { email: string; password?: string }) {
      p.chamadas.push("auth.createUser");
      if (p.usuarios.some((u) => u.email === attrs.email)) return { data: { user: null }, error: { message: "já existe" } };
      const u: UsuarioFake = {
        id: crypto.randomUUID(), email: attrs.email, app_metadata: {}, user_metadata: {},
        created_at: new Date().toISOString(), last_sign_in_at: null, banned_until: null, password: attrs.password,
      };
      p.usuarios.push(u);
      if (p.gatilhoPerfil) p.tabela("profiles").push({ id: u.id, clinic_id: "c0000000-0000-0000-0000-000000000001", email: u.email, role: "terapeuta", active: true });
      return { data: { user: { ...u } }, error: null };
    },
    async deleteUser(id: string) {
      p.chamadas.push("auth.deleteUser");
      p.usuarios = p.usuarios.filter((u) => u.id !== id);
      return { data: null, error: null };
    },
    async updateUserById(id: string, attrs: { ban_duration?: string; app_metadata?: Record<string, unknown>; password?: string }) {
      p.chamadas.push("auth.updateUserById");
      const u = achar(id);
      if (!u) return { data: { user: null }, error: { message: "não achei" } };
      if (attrs.ban_duration !== undefined) {
        u.banned_until = attrs.ban_duration === "none" ? null : new Date(Date.now() + 100 * 365 * 24 * 3600 * 1000).toISOString();
      }
      if (attrs.app_metadata) u.app_metadata = { ...attrs.app_metadata };
      if (attrs.password) u.password = attrs.password;
      return { data: { user: { ...u } }, error: null };
    },
    async generateLink(attrs: { email: string }) {
      p.chamadas.push("auth.generateLink");
      let u = p.usuarios.find((x) => x.email === attrs.email);
      if (!u) {
        const r = await adminAuth(p).createUser({ email: attrs.email });
        u = p.usuarios.find((x) => x.email === attrs.email)!;
        void r;
      }
      return { data: { properties: { hashed_token: `tok-${attrs.email}` }, user: { ...u } }, error: null };
    },
  };
}

export function createClient(url: string, _key: string, _opts?: unknown) {
  const p = projeto(url);
  return {
    from: (nome: string) => new Consulta(p, nome),
    auth: { admin: adminAuth(p), getUser: (jwt: string) => adminAuth(p).getUser(jwt) },
    storage: {
      from: (bucket: string) => ({
        async createSignedUrl(path: string, seconds: number, opts?: { download?: string | boolean }) {
          if (p.operacoesComErro.has("storage:createSignedUrl")) return { data: null, error: { message: "Object not found" } };
          p.assinaturas.push({ bucket, path, seconds, download: opts?.download });
          return { data: { signedUrl: `http://a/storage/${bucket}/${path}?t=x` }, error: null };
        },
      }),
    },
    // Imita public.hub_encerrar_sessoes (projeto B): só age em quem já está banido e nunca em conta de unidade.
    async rpc(nome: string, args: { p_user_id: string }) {
      p.chamadas.push(`rpc:${nome}`);
      if (p.operacoesComErro.has(`rpc:${nome}`)) return { data: null, error: { message: "função indisponível" } };
      const u = p.usuarios.find((x) => x.id === args.p_user_id);
      if (!u || !u.banned_until || Date.parse(u.banned_until) <= Date.now()) return { data: null, error: { message: "usuário não está bloqueado" } };
      if (String(u.app_metadata?.role ?? "").endsWith("_unit")) return { data: null, error: { message: "conta de unidade não é alterada pelo Hub" } };
      const n = p.sessoes[u.id] ?? 0;
      p.sessoes[u.id] = 0;
      return { data: n, error: null };
    },
  };
}
