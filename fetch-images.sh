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

# Free-to-use Pexels photos for the Martyn's Law business guide (credited in-page).
# Pexels serves these from its public CDN; the ?auto=compress query is the format
# Pexels itself hotlinks. If any 404s, the <figure> hides itself gracefully.
get "martyns-law-cafe.jpg" "https://images.pexels.com/photos/930402/pexels-photo-930402.jpeg?auto=compress&cs=tinysrgb&w=1200"
get "martyns-law-staff-briefing.jpg" "https://images.pexels.com/photos/7640438/pexels-photo-7640438.jpeg?auto=compress&cs=tinysrgb&w=1200"
get "martyns-law-event-crowd.jpg" "https://images.pexels.com/photos/3727129/pexels-photo-3727129.jpeg?auto=compress&cs=tinysrgb&w=1200"

# Free-to-use Pexels photos for the PoliceAI explainer (credited in-page).
get "policeai-hero.jpg" "https://images.pexels.com/photos/20783671/pexels-photo-20783671.jpeg?auto=compress&cs=tinysrgb&w=1400"
get "policeai-network.jpg" "https://images.pexels.com/photos/8386437/pexels-photo-8386437.jpeg?auto=compress&cs=tinysrgb&w=1200"
get "policeai-soze-servers.jpg" "https://images.pexels.com/photos/17489157/pexels-photo-17489157.jpeg?auto=compress&cs=tinysrgb&w=1200"
get "policeai-copilot-typewriter.jpg" "https://images.pexels.com/photos/4604607/pexels-photo-4604607.jpeg?auto=compress&cs=tinysrgb&w=1200"
get "policeai-facial-recognition.jpg" "https://images.pexels.com/photos/8090124/pexels-photo-8090124.jpeg?auto=compress&cs=tinysrgb&w=1200"
get "policeai-redaction-cctv.jpg" "https://images.pexels.com/photos/36852946/pexels-photo-36852946.jpeg?auto=compress&cs=tinysrgb&w=1200"
get "policeai-justice.jpg" "https://images.pexels.com/photos/30483132/pexels-photo-30483132.jpeg?auto=compress&cs=tinysrgb&w=1200"

# Free-to-use Pexels photos replacing earlier generic stock with images that
# fit each article's subject (hero + card thumbnail).
get "england-football-crowd.jpg" "https://images.pexels.com/photos/1884576/pexels-photo-1884576.jpeg?auto=compress&cs=tinysrgb&w=1600"
get "missing-foggy-road.jpg" "https://images.pexels.com/photos/14744912/pexels-photo-14744912.jpeg?auto=compress&cs=tinysrgb&w=1600"
get "cognitive-diversity-jigsaw.jpg" "https://images.pexels.com/photos/1586950/pexels-photo-1586950.jpeg?auto=compress&cs=tinysrgb&w=1600"
get "self-selection-car-street.jpg" "https://images.pexels.com/photos/7459482/pexels-photo-7459482.jpeg?auto=compress&cs=tinysrgb&w=1600"

# Free-to-use Pexels photos replacing the dark SVG "title-card" heroes with real
# photographs. These also become each article's og:image / card thumbnail, so the
# subject reads at a glance and social shares no longer fall back to an SVG.
get "ai-guide-hero.jpg" "https://images.pexels.com/photos/37730212/pexels-photo-37730212.jpeg?auto=compress&cs=tinysrgb&w=1600"
get "burnout-hero.jpg" "https://images.pexels.com/photos/6837643/pexels-photo-6837643.jpeg?auto=compress&cs=tinysrgb&w=1600"
get "fuel-theft-hero.jpg" "https://images.pexels.com/photos/12377481/pexels-photo-12377481.jpeg?auto=compress&cs=tinysrgb&w=1600"
get "murray-ebp-hero.jpg" "https://images.pexels.com/photos/29822051/pexels-photo-29822051.jpeg?auto=compress&cs=tinysrgb&w=1600"
get "sherman-ebp-hero.jpg" "https://images.pexels.com/photos/12689753/pexels-photo-12689753.jpeg?auto=compress&cs=tinysrgb&w=1600"
get "knabe-nicol-hero.jpg" "https://images.pexels.com/photos/8761351/pexels-photo-8761351.jpeg?auto=compress&cs=tinysrgb&w=1600"
get "martyns-law-hero.jpg" "https://images.pexels.com/photos/5193526/pexels-photo-5193526.jpeg?auto=compress&cs=tinysrgb&w=1600"
get "martyns-law-business-hero.jpg" "https://images.pexels.com/photos/6814345/pexels-photo-6814345.jpeg?auto=compress&cs=tinysrgb&w=1600"

echo "Done. $(ls -1 | wc -l) images in public/images/"
