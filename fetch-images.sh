#!/usr/bin/env bash
# Run this from the project root WHILE your WordPress site is still live.
# It downloads your self-hosted images into public/images/ so the new
# site no longer depends on WordPress. Safe to re-run.
#
# This also runs automatically during the Netlify build (see netlify.toml).
# A missing image is non-fatal: it logs FAILED and the build continues.
set -e
mkdir -p public/images
cd public/images

# Some WordPress installs (Wordfence etc.) reject requests without a
# browser user-agent, so send one.
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

get() {
  # get <filename> <url>
  curl -fsSL -A "$UA" -o "$1" "$2" && echo "  got $1" || echo "  FAILED $1"
}

get "17653712411483451853423865393856.jpg" "https://thinkingaboutpolicing.co.uk/wp-content/uploads/2025/12/17653712411483451853423865393856.jpg"
get "17653714008195351195832712231149-1024x590.jpg" "https://thinkingaboutpolicing.co.uk/wp-content/uploads/2025/12/17653714008195351195832712231149-1024x590.jpg"
get "1766502332432420459162184927612.jpg" "https://thinkingaboutpolicing.co.uk/wp-content/uploads/2025/12/1766502332432420459162184927612.jpg"
get "17665023356217569033943607914549.jpg" "https://thinkingaboutpolicing.co.uk/wp-content/uploads/2025/12/17665023356217569033943607914549.jpg"
get "17665023390687019426064417612503.jpg" "https://thinkingaboutpolicing.co.uk/wp-content/uploads/2025/12/17665023390687019426064417612503.jpg"
get "17665023410648183972021291224946.jpg" "https://thinkingaboutpolicing.co.uk/wp-content/uploads/2025/12/17665023410648183972021291224946.jpg"
get "17665025160078295174207330247108.jpg" "https://thinkingaboutpolicing.co.uk/wp-content/uploads/2025/12/17665025160078295174207330247108.jpg"
get "1766502733392526385431853383831.jpg" "https://thinkingaboutpolicing.co.uk/wp-content/uploads/2025/12/1766502733392526385431853383831.jpg"
get "17665027398266744301230980938455.jpg" "https://thinkingaboutpolicing.co.uk/wp-content/uploads/2025/12/17665027398266744301230980938455.jpg"
get "17678715405872662829070664106378.jpg" "https://thinkingaboutpolicing.co.uk/wp-content/uploads/2026/01/17678715405872662829070664106378.jpg"
get "image.png" "https://thinkingaboutpolicing.co.uk/wp-content/uploads/2026/04/image.png"
get "image_editor_output_image1681454371-17655514280582700668508713128379.png" "https://thinkingaboutpolicing.co.uk/wp-content/uploads/2025/12/image_editor_output_image1681454371-17655514280582700668508713128379.png"
get "screenshot_20251210-1240451896020900775513687-1024x598.png" "https://thinkingaboutpolicing.co.uk/wp-content/uploads/2025/12/screenshot_20251210-1240451896020900775513687-1024x598.png"
get "screenshot_20251210-1240455544298525220360975-1024x598.png" "https://thinkingaboutpolicing.co.uk/wp-content/uploads/2025/12/screenshot_20251210-1240455544298525220360975-1024x598.png"
get "screenshot_20251212-1507118259648032391736812.png" "https://thinkingaboutpolicing.co.uk/wp-content/uploads/2025/12/screenshot_20251212-1507118259648032391736812.png"
get "share_62732086914530934196007772124391850255.png" "https://thinkingaboutpolicing.co.uk/wp-content/uploads/2025/12/share_62732086914530934196007772124391850255.png"
# Note: the Somerton cipher (somerton-man-code.jpg) and Tamám Shud scrap
# (somerton-tamam-shud.jpg) are now committed directly in public/images, so
# they no longer need to be fetched from WordPress.

# Public-domain Somerton Man case images from Wikimedia Commons (1948 South
# Australia Police material, public domain by age). Special:FilePath resolves
# the canonical file name to the underlying upload URL.
get "somerton-man-1948.jpg" "https://commons.wikimedia.org/wiki/Special:FilePath/SomertonMan.jpg"
get "somerton-man-suitcase.jpg" "https://commons.wikimedia.org/wiki/Special:FilePath/SomertonManSuitcase.jpg"
get "somerton-code-note.jpg" "https://commons.wikimedia.org/wiki/Special:FilePath/SomertonManCode.jpg"

# Openly-licensed article images from Wikimedia Commons (credited in-page).
get "neighbourhood-policing-patrol.jpg" "https://commons.wikimedia.org/wiki/Special:FilePath/Police.three.on.patrol.london.arp.jpg"
get "fuel-filling-station.jpg" "https://commons.wikimedia.org/wiki/Special:FilePath/A%20modern%20BP%20gas%20station%20or%20filling%20station%20in%20the%20United%20States%2005.jpg"
get "neurodiversity-symbol.svg" "https://commons.wikimedia.org/wiki/Special:FilePath/Neurodiversity%20Symbol.svg"
get "police-officer-on-duty.jpg" "https://commons.wikimedia.org/wiki/Special:FilePath/Slovak%20police%20car%20and%20police%20officer%20on%20duty%20(cropped).JPG"

# Lawrence Sherman portrait from Wikimedia Commons (Stockholm Criminology
# Symposium, 2023; credited in-page). The canonical Commons file name contains
# a typo ("Confernce"), so try that spelling first and fall back to the
# corrected one. Either way the surviving file is the same photo.
curl -fsSL -A "$UA" -o "sherman-lawrence-portrait.jpg" "https://commons.wikimedia.org/wiki/Special:FilePath/Lawrence%20Sherman%20Stockholm%20Confernce%202023.jpg" \
  || curl -fsSL -A "$UA" -o "sherman-lawrence-portrait.jpg" "https://commons.wikimedia.org/wiki/Special:FilePath/Lawrence%20Sherman%20Stockholm%20Conference%202023.jpg" \
  && echo "  got sherman-lawrence-portrait.jpg" || echo "  FAILED sherman-lawrence-portrait.jpg"

echo "Done. $(ls -1 | wc -l) images in public/images/"
