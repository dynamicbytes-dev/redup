import base64
from PIL import Image

# Read the high-res 192x192 PNG and embed it cleanly inside an SVG container
# and also provide an SVG vector markup
with open("assets/images/notification-icon.png", "rb") as f:
    b64_png = base64.b64encode(f.read()).decode("utf-8")

svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" width="192" height="192">
  <!-- Akatsuki Cloud Notification Icon (White Monochrome on Transparent) -->
  <image href="data:image/png;base64,{b64_png}" x="0" y="0" width="192" height="192" />
</svg>
'''

with open("assets/images/notification-icon.svg", "w") as f:
    f.write(svg_content)

print("Saved assets/images/notification-icon.svg")
