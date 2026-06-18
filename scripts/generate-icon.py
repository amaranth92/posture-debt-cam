import struct, zlib
from pathlib import Path

OUT = Path('build')
OUT.mkdir(exist_ok=True)


def png_rgba(size):
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            nx = (x / (size - 1)) * 2 - 1
            ny = (y / (size - 1)) * 2 - 1
            r2 = nx * nx + ny * ny
            # rounded-square alpha mask
            edge = max(abs(nx), abs(ny))
            alpha = 255 if edge < 0.88 else max(0, min(255, int((0.98 - edge) / 0.10 * 255)))
            # dark purple/yellow gradient
            r = int(12 + 34 * (1 - y / size) + 50 * max(0, -nx))
            g = int(14 + 20 * (x / size) + 28 * (1 - r2))
            b = int(24 + 70 * (1 - y / size) + 40 * max(0, nx))
            # fog circle
            if (nx + 0.05) ** 2 + (ny + 0.02) ** 2 < 0.52:
                r = min(255, r + 38); g = min(255, g + 42); b = min(255, b + 48)
            # stylized hunched neck/spine stroke
            stroke = False
            # head
            if (nx - 0.06) ** 2 + (ny + 0.42) ** 2 < 0.055:
                stroke = True
            # neck/back curve
            curve_x = 0.03 + 0.38 * (ny + 0.25) ** 2
            if -0.22 < ny < 0.50 and abs(nx - curve_x) < 0.045:
                stroke = True
            # shoulder line
            if 0.02 < ny < 0.16 and -0.55 < nx < 0.30 and abs(ny - (0.10 + 0.06 * nx)) < 0.035:
                stroke = True
            if stroke:
                r, g, b = 255, 207, 87
            # red bill corner
            if nx > 0.38 and ny > 0.38:
                r = max(r, 230); g = int(g * 0.55); b = int(b * 0.65)
            r = max(0, min(255, r)); g = max(0, min(255, g)); b = max(0, min(255, b)); alpha = max(0, min(255, alpha))
            row.extend([r, g, b, alpha])
        rows.append(bytes(row))
    raw = b''.join(rows)
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')

sizes = {16: 'icp4', 32: 'icp5', 64: 'icp6', 128: 'ic07', 256: 'ic08', 512: 'ic09', 1024: 'ic10'}
chunks = []
for size, code in sizes.items():
    data = png_rgba(size)
    (OUT / f'icon-{size}.png').write_bytes(data)
    chunks.append(code.encode('ascii') + struct.pack('>I', len(data) + 8) + data)

icns_body = b''.join(chunks)
(OUT / 'icon.icns').write_bytes(b'icns' + struct.pack('>I', len(icns_body) + 8) + icns_body)
(OUT / 'icon.png').write_bytes(png_rgba(1024))
print('generated build/icon.icns and build/icon.png')
