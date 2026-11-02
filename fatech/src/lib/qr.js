import QRCode from 'qrcode';
import marca from '../data/marca.json';

// Endereço do cadastro com a origem (rollup, mesa, cartao, tv...) para saber qual peça trouxe o contato.
export function urlCadastro(origem) {
  return `${marca.siteUrl}/cadastro?origem=${encodeURIComponent(origem)}`;
}

// QR em SVG, com correção alta (continua legível mesmo com amassado ou reflexo).
export async function qrSvg(texto, { cor = '#0F2E36', fundo = '#FFFFFF' } = {}) {
  return QRCode.toString(texto, {
    type: 'svg',
    errorCorrectionLevel: 'H',
    margin: 0,
    color: { dark: cor, light: fundo },
  });
}
