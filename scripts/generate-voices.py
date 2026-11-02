import asyncio
import re
import sys
from pathlib import Path
import edge_tts

VOICE = "pt-BR-FranciscaNeural"
RATE = "-8%"
VOLUME = "+0%"

ROOT_DIR = Path(__file__).resolve().parent.parent
ROTEIRO_FILE = ROOT_DIR / "conteudo" / "tv-salao-roteiro-de-vozes.md"
OUTPUT_DIR = ROOT_DIR / "public" / "audio" / "voz"

async def generate_voice(filename: str, text: str, semaphore: asyncio.Semaphore):
    async with semaphore:
        out_path = OUTPUT_DIR / filename
        print(f"Gerando: {filename} -> \"{text}\"...")
        try:
            communicate = edge_tts.Communicate(
                text=text,
                voice=VOICE,
                rate=RATE,
                volume=VOLUME
            )
            await communicate.save(str(out_path))
            print(f" OK: {filename} ({out_path.stat().st_size} bytes)")
        except Exception as e:
            print(f" ERRO ao gerar {filename}: {e}", file=sys.stderr)
            raise

async def main():
    if not ROTEIRO_FILE.exists():
        print(f"Arquivo de roteiro não encontrado: {ROTEIRO_FILE}", file=sys.stderr)
        sys.exit(1)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    content = ROTEIRO_FILE.read_text(encoding="utf-8")
    matches = re.findall(r'\|\s*([a-zA-Z0-9_\-]+\.mp3)\s*\|\s*([^|\n\r]+?)\s*\|', content)

    if not matches:
        print("Nenhuma fala encontrada no roteiro!", file=sys.stderr)
        sys.exit(1)

    print(f"Encontradas {len(matches)} falas no roteiro.")
    print(f"Voz: {VOICE} | Taxa: {RATE}")
    print(f"Destino: {OUTPUT_DIR}\n")

    # Limita concorrência para evitar rate limit do endpoint
    semaphore = asyncio.Semaphore(5)
    tasks = [generate_voice(fn, text.strip(), semaphore) for fn, text in matches]

    await asyncio.gather(*tasks)
    print(f"\nSucesso: todas as {len(matches)} vozes foram geradas em '{OUTPUT_DIR}'.")

if __name__ == "__main__":
    asyncio.run(main())
