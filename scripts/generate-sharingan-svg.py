import base64

with open("assets/images/icon.png", "rb") as f:
    b64_png = base64.b64encode(f.read()).decode("utf-8")

svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <radialGradient id="irisGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#EF4444" stop-opacity="0.35" />
      <stop offset="80%" stop-color="#991B1B" stop-opacity="0.1" />
      <stop offset="100%" stop-color="#0B0B0E" stop-opacity="0" />
    </radialGradient>
  </defs>
  <!-- Background Aura -->
  <rect width="1024" height="1024" fill="#0B0B0E" />
  <circle cx="512" cy="512" r="460" fill="url(#irisGlow)" />
  <!-- Itachi Mangekyo Sharingan (Raster Vector Hybrid) -->
  <image href="data:image/png;base64,{b64_png}" x="0" y="0" width="1024" height="1024" />
</svg>
'''

with open("assets/images/sharingan.svg", "w") as f:
    f.write(svg_content)

with open("assets/images/logo.svg", "w") as f:
    f.write(svg_content)

print("Saved assets/images/sharingan.svg and assets/images/logo.svg")
