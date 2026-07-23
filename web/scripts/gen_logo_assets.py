from pathlib import Path
from PIL import Image

src = Path(
    r"C:\Users\Asus\.cursor\projects\c-Users-Asus-Desktop-orzuvideo\assets"
    r"\c__Users_Asus_AppData_Roaming_Cursor_User_workspaceStorage_"
    r"4ca97b337df8f4a69f4b0d10a4bbd9d8_images_photo_2026-07-23_02-29-29-"
    r"b54c7fb1-b5f2-4f44-8952-e44ca7fda5ab.png"
)
out_dir = Path(r"c:\Users\Asus\Desktop\orzuvideo\web\public")
icons = out_dir / "icons"
icons.mkdir(parents=True, exist_ok=True)
app_dir = Path(r"c:\Users\Asus\Desktop\orzuvideo\web\src\app")

img = Image.open(src).convert("RGBA")
pixels = img.load()
w, h = img.size

for y in range(h):
    for x in range(w):
        r, g, b, a = pixels[x, y]
        if r < 28 and g < 28 and b < 28:
            pixels[x, y] = (0, 0, 0, 0)

bbox = img.getbbox()
if bbox:
    pad = 8
    x0, y0, x1, y1 = bbox
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(w, x1 + pad)
    y1 = min(h, y1 + pad)
    img = img.crop((x0, y0, x1, y1))


def to_square(im: Image.Image, size: int, margin_ratio: float = 0.12) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    max_side = int(size * (1 - margin_ratio * 2))
    copy = im.copy()
    copy.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    ox = (size - copy.width) // 2
    oy = (size - copy.height) // 2
    canvas.paste(copy, (ox, oy), copy)
    return canvas


master = img.copy()
master.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
master.save(out_dir / "logo.png", "PNG")
print("saved logo.png", master.size)

to_square(img, 512, 0.08).save(out_dir / "logo-mark.png", "PNG")
print("saved logo-mark.png")

for size, dest in [
    (16, out_dir / "favicon-16.png"),
    (32, out_dir / "favicon-32.png"),
    (180, out_dir / "apple-touch-icon.png"),
    (192, icons / "icon-192.png"),
    (512, icons / "icon-512.png"),
]:
    to_square(img, size, 0.1 if size >= 180 else 0.08).save(dest, "PNG")
    print("saved", dest)

to_square(img, 32, 0.08).save(app_dir / "icon.png", "PNG")
to_square(img, 180, 0.1).save(app_dir / "apple-icon.png", "PNG")
print("saved app icons")

ico16 = to_square(img, 16, 0.06)
ico32 = to_square(img, 32, 0.08)
ico48 = to_square(img, 48, 0.08)
ico32.save(
    out_dir / "favicon.ico",
    format="ICO",
    sizes=[(16, 16), (32, 32), (48, 48)],
    append_images=[ico16, ico48],
)
print("saved favicon.ico")

og = Image.new("RGB", (1200, 630), (12, 12, 12))
logo_og = img.copy()
logo_og.thumbnail((520, 520), Image.Resampling.LANCZOS)
ox = (1200 - logo_og.width) // 2
oy = (630 - logo_og.height) // 2 - 20
og.paste(logo_og, (ox, oy), logo_og)
og.save(out_dir / "og.png", "PNG")
print("saved og.png")

legacy = out_dir / "icon-512.png"
to_square(img, 512, 0.1).save(legacy, "PNG")
print("replaced", legacy)
print("done")
