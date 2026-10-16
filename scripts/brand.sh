#!/bin/bash
# Genererer splash-filerne i public/brand/splash/ ud fra originalerne i design/splash/.
# Redigér aldrig de genererede filer direkte. Kræver ImageMagick (magick) — ingen npm-pakke.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=design/splash OUT=public/brand/splash
mkdir -p "$OUT"
# Baggrunden (logo, glød, bølger — uden fly). AVIF først, WebP som fald; originalen er 1,4 MB
# PNG, og en splash, der selv skal hentes, må ikke være det langsomme led.
magick "$SRC/splash-bg.png" -quality 55 "$OUT/splash-bg.avif"
magick "$SRC/splash-bg.png" -quality 78 -define webp:method=6 "$OUT/splash-bg.webp"
# Bred udgave til tablet/liggende (2:1): billedets yderste kanter strakt ud til siderne,
# originalen centreret i fuld højde med bløde kanter. Højden er den samme (1672), så flyet (skaleret til
# højden) stadig rammer cirklen.
W=3344; H=1672; F=120
T=$(mktemp -d)
S=$(( (W - 941) / 2 + F ))
magick "$SRC/splash-bg.png" -crop "4x${H}+0+0" +repage -resize "${S}x${H}!" -blur 0x30 "$T/left.png"
magick "$SRC/splash-bg.png" -crop "4x${H}+937+0" +repage -resize "${S}x${H}!" -blur 0x30 "$T/right.png"
magick "$T/left.png" \( -size "$((W - 2 * S))x${H}" xc:'#0a1e33' \) "$T/right.png" +append "$T/back.png"
magick \( -size "${H}x${F}" gradient:black-white -rotate -90 \) \( -size "$((941 - 2 * F))x${H}" xc:white \) \( -size "${H}x${F}" gradient:white-black -rotate -90 \) +append "$T/mask.png"
magick "$SRC/splash-bg.png" "$T/mask.png" -alpha off -compose CopyOpacity -composite "$T/front.png"
magick "$T/back.png" "$T/front.png" -gravity center -compose Over -composite "$T/wide.png"
magick "$T/wide.png" -quality 55 "$OUT/splash-bg-wide.avif"
magick "$T/wide.png" -quality 78 -define webp:method=6 "$OUT/splash-bg-wide.webp"
# iOS' egne opstartsbilleder (apple-touch-startup-image): vises med det samme, før siden er
# indlæst — ellers er skærmen sort, til HTML'en er der. Baggrund + flyet i animationens første
# position (design/splash/plane-rest.png), så det letter derfra uden spring. Beskåret som
# splashen (cover, centreret). Størrelser: scripts/startup-sizes.json (læses også af nuxt.config.ts).
magick "$SRC/splash-bg.png" "$SRC/plane-rest.png" -composite "$T/startup.png"
rm -f "$OUT"/startup-*.jpg
for size in $(node -e 'for (const s of require("./scripts/startup-sizes.json")) console.log(`${s.w * s.r}x${s.h * s.r}`)'); do
  magick "$T/startup.png" -resize "${size}^" -gravity center -extent "$size" -quality 85 "$OUT/startup-$size.jpg"
done
rm -rf "$T"
# Flyet, der flyver rundt om logoet: separat SVG-lag (SMIL), samme viewBox som baggrunden.
cp "$SRC/flight-overlay.svg" "$OUT/flight.svg"
ls -la "$OUT"
