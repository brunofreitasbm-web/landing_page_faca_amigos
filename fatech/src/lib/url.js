// Monta links respeitando a base /fatech (o site vive em institutofacaamigos.com.br/fatech).
const base = import.meta.env.BASE_URL.replace(/\/$/, '');
export const u = (caminho = '/') => base + (caminho.startsWith('/') ? caminho : `/${caminho}`);
