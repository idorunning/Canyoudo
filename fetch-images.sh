#!/usr/bin/env bash
# Run this from the project root WHILE your WordPress site is still live.
# It downloads your self-hosted images into public/images/ so the new
# site no longer depends on WordPress. Safe to re-run.
set -e
mkdir -p public/images
cd public/images

curl -fsSL -o "17653712411483451853423865393856.jpg" "https://thinkingaboutpolicing.co.uk/wp-content/uploads/2025/12/17653712411483451853423865393856.jpg" && echo "  got 17653712411483451853423865393856.jpg" || echo "  FAILED 17653712411483451853423865393856.jpg"
curl -fsSL -o "17653714008195351195832712231149-1024x590.jpg" "https://thinkingaboutpolicing.co.uk/wp-content/uploads/2025/12/17653714008195351195832712231149-1024x590.jpg" && echo "  got 17653714008195351195832712231149-1024x590.jpg" || echo "  FAILED 17653714008195351195832712231149-1024x590.jpg"
curl -fsSL -o "1766502332432420459162184927612.jpg" "https://thinkingaboutpolicing.co.uk/wp-content/uploads/2025/12/1766502332432420459162184927612.jpg" && echo "  got 1766502332432420459162184927612.jpg" || echo "  FAILED 1766502332432420459162184927612.jpg"
curl -fsSL -o "17665023356217569033943607914549.jpg" "https://thinkingaboutpolicing.co.uk/wp-content/uploads/2025/12/17665023356217569033943607914549.jpg" && echo "  got 17665023356217569033943607914549.jpg" || echo "  FAILED 17665023356217569033943607914549.jpg"
curl -fsSL -o "17665023390687019426064417612503.jpg" "https://thinkingaboutpolicing.co.uk/wp-content/uploads/2025/12/17665023390687019426064417612503.jpg" && echo "  got 17665023390687019426064417612503.jpg" || echo "  FAILED 17665023390687019426064417612503.jpg"
curl -fsSL -o "17665023410648183972021291224946.jpg" "https://thinkingaboutpolicing.co.uk/wp-content/uploads/2025/12/17665023410648183972021291224946.jpg" && echo "  got 17665023410648183972021291224946.jpg" || echo "  FAILED 17665023410648183972021291224946.jpg"
curl -fsSL -o "17665025160078295174207330247108.jpg" "https://thinkingaboutpolicing.co.uk/wp-content/uploads/2025/12/17665025160078295174207330247108.jpg" && echo "  got 17665025160078295174207330247108.jpg" || echo "  FAILED 17665025160078295174207330247108.jpg"
curl -fsSL -o "1766502733392526385431853383831.jpg" "https://thinkingaboutpolicing.co.uk/wp-content/uploads/2025/12/1766502733392526385431853383831.jpg" && echo "  got 1766502733392526385431853383831.jpg" || echo "  FAILED 1766502733392526385431853383831.jpg"
curl -fsSL -o "17665027398266744301230980938455.jpg" "https://thinkingaboutpolicing.co.uk/wp-content/uploads/2025/12/17665027398266744301230980938455.jpg" && echo "  got 17665027398266744301230980938455.jpg" || echo "  FAILED 17665027398266744301230980938455.jpg"
curl -fsSL -o "17678715405872662829070664106378.jpg" "https://thinkingaboutpolicing.co.uk/wp-content/uploads/2026/01/17678715405872662829070664106378.jpg" && echo "  got 17678715405872662829070664106378.jpg" || echo "  FAILED 17678715405872662829070664106378.jpg"
curl -fsSL -o "image.png" "https://thinkingaboutpolicing.co.uk/wp-content/uploads/2026/04/image.png" && echo "  got image.png" || echo "  FAILED image.png"
curl -fsSL -o "image_editor_output_image1681454371-17655514280582700668508713128379.png" "https://thinkingaboutpolicing.co.uk/wp-content/uploads/2025/12/image_editor_output_image1681454371-17655514280582700668508713128379.png" && echo "  got image_editor_output_image1681454371-17655514280582700668508713128379.png" || echo "  FAILED image_editor_output_image1681454371-17655514280582700668508713128379.png"
curl -fsSL -o "screenshot_20251210-1240451896020900775513687-1024x598.png" "https://thinkingaboutpolicing.co.uk/wp-content/uploads/2025/12/screenshot_20251210-1240451896020900775513687-1024x598.png" && echo "  got screenshot_20251210-1240451896020900775513687-1024x598.png" || echo "  FAILED screenshot_20251210-1240451896020900775513687-1024x598.png"
curl -fsSL -o "screenshot_20251210-1240455544298525220360975-1024x598.png" "https://thinkingaboutpolicing.co.uk/wp-content/uploads/2025/12/screenshot_20251210-1240455544298525220360975-1024x598.png" && echo "  got screenshot_20251210-1240455544298525220360975-1024x598.png" || echo "  FAILED screenshot_20251210-1240455544298525220360975-1024x598.png"
curl -fsSL -o "screenshot_20251212-1507118259648032391736812.png" "https://thinkingaboutpolicing.co.uk/wp-content/uploads/2025/12/screenshot_20251212-1507118259648032391736812.png" && echo "  got screenshot_20251212-1507118259648032391736812.png" || echo "  FAILED screenshot_20251212-1507118259648032391736812.png"
curl -fsSL -o "share_62732086914530934196007772124391850255.png" "https://thinkingaboutpolicing.co.uk/wp-content/uploads/2025/12/share_62732086914530934196007772124391850255.png" && echo "  got share_62732086914530934196007772124391850255.png" || echo "  FAILED share_62732086914530934196007772124391850255.png"
curl -fsSL -o "somerton-man-code-1024x818.jpg" "https://thinkingaboutpolicing.co.uk/wp-content/uploads/2025/12/somerton-man-code-1024x818.jpg" && echo "  got somerton-man-code-1024x818.jpg" || echo "  FAILED somerton-man-code-1024x818.jpg"
curl -fsSL -o "tama.jpg" "https://thinkingaboutpolicing.co.uk/wp-content/uploads/2025/12/tama.jpg" && echo "  got tama.jpg" || echo "  FAILED tama.jpg"

echo "Done. $(ls -1 | wc -l) images in public/images/"