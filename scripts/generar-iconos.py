"""Genera todos los iconos (web, iOS, Android) a partir de public/icons/icon.svg.

Uso: python3 scripts/generar-iconos.py   (requiere Pillow y Playwright con Chromium)
"""
from pathlib import Path

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).resolve().parent.parent
SVG = RAIZ / "public/icons/icon.svg"
FONDO = (31, 111, 120)  # #1F6F78
RES = RAIZ / "android/app/src/main/res"
DENSIDADES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def renderizar(destino: Path, lado: int = 1024) -> Image.Image:
    with sync_playwright() as p:
        navegador = p.chromium.launch()
        pagina = navegador.new_page(viewport={"width": lado, "height": lado})
        pagina.set_content(f'<body style="margin:0">{SVG.read_text()}</body>')
        pagina.locator("svg").screenshot(path=str(destino))
        navegador.close()
    return Image.open(destino).convert("RGB")


def guardar(img: Image.Image, ruta: Path, lado: int) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    img.resize((lado, lado), Image.LANCZOS).save(ruta, optimize=True)


def redondo(img: Image.Image, lado: int) -> Image.Image:
    mascara = Image.new("L", (lado * 4, lado * 4), 0)
    ImageDraw.Draw(mascara).ellipse((0, 0, lado * 4 - 1, lado * 4 - 1), fill=255)
    salida = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    salida.paste(img.resize((lado, lado), Image.LANCZOS), mask=mascara.resize((lado, lado), Image.LANCZOS))
    return salida


def main() -> None:
    base = renderizar(RAIZ / "public/icons/maskable-512.png")

    # Web / PWA (el SVG ya deja margen de seguridad, sirve también como maskable)
    for nombre, lado in {"maskable-512.png": 512, "icon-512.png": 512, "icon-192.png": 192, "apple-touch-icon.png": 180}.items():
        guardar(base, RAIZ / "public/icons" / nombre, lado)

    # iOS (1024 sin transparencia)
    guardar(base, RAIZ / "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png", 1024)

    # Android: lanzador clásico, redondo y adaptable
    for densidad, factor in DENSIDADES.items():
        carpeta = RES / f"mipmap-{densidad}"
        lado = round(48 * factor)
        guardar(base, carpeta / "ic_launcher.png", lado)
        redondo(base, lado).save(carpeta / "ic_launcher_round.png", optimize=True)
        # Adaptable: el sistema solo muestra los 72 dp centrales de 108 → el icono va al 66 % sobre el fondo de marca.
        primer_plano, interior = round(108 * factor), round(72 * factor)
        lienzo = Image.new("RGB", (primer_plano, primer_plano), FONDO)
        margen = (primer_plano - interior) // 2
        lienzo.paste(base.resize((interior, interior), Image.LANCZOS), (margen, margen))
        lienzo.save(carpeta / "ic_launcher_foreground.png", optimize=True)

    # Pantallas de inicio: fondo de marca con el icono centrado
    splashes = list(RES.glob("drawable*/splash.png")) + list((RAIZ / "ios/App/App/Assets.xcassets/Splash.imageset").glob("splash-*.png"))
    for ruta in splashes:
        ancho, alto = Image.open(ruta).size
        lado = min(ancho, alto) // 3
        lienzo = Image.new("RGB", (ancho, alto), FONDO)
        lienzo.paste(base.resize((lado, lado), Image.LANCZOS), ((ancho - lado) // 2, (alto - lado) // 2))
        lienzo.save(ruta, optimize=True)

    print(f"Iconos generados desde {SVG.relative_to(RAIZ)}")


if __name__ == "__main__":
    main()
