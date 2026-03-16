# Visual Diagram — Setup Guide

Generate beautiful, illustration-quality diagrams using SVG blueprints + Google's Nano Banana 2 image model.

## Prerequisites

- Python 3.11+ with [uv](https://docs.astral.sh/uv/)
- Gemini API key ([Google AI Studio](https://aistudio.google.com/app/apikey))
- Tavily API key ([tavily.com](https://www.tavily.com)) — free tier: 1,000 requests/month

## First-Time Setup

```bash
# Navigate to the scripts directory
cd <your-project>/.claude/skills/visual-diagram/scripts

# Install Python dependencies
uv sync

# Configure API keys (option A: environment variables)
export GEMINI_API_KEY="AIza..."
export TAVILY_API_KEY="tvly-..."

# Configure API keys (option B: config file — persists across sessions)
mkdir -p ~/.config/visual-diagram
cat > ~/.config/visual-diagram/config.json << 'EOF'
{
  "gemini_api_key": "AIza...",
  "tavily_api_key": "tvly-..."
}
EOF
```

## Quick Test

```bash
# Create a simple test SVG
cat > /tmp/test-diagram.svg << 'SVGEOF'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400">
  <rect width="800" height="400" fill="#fafafa"/>
  <text x="400" y="60" text-anchor="middle" font-size="32" font-weight="bold" fill="#263238">How It Works</text>
  <rect x="50" y="120" width="200" height="100" rx="15" fill="#E8F5E9" stroke="#2E7D32" stroke-width="2"/>
  <text x="150" y="175" text-anchor="middle" font-size="20" fill="#1B5E20">Input</text>
  <rect x="300" y="120" width="200" height="100" rx="15" fill="#E3F2FD" stroke="#1565C0" stroke-width="2"/>
  <text x="400" y="175" text-anchor="middle" font-size="20" fill="#0D47A1">Process</text>
  <rect x="550" y="120" width="200" height="100" rx="15" fill="#FFF3E0" stroke="#E65100" stroke-width="2"/>
  <text x="650" y="175" text-anchor="middle" font-size="20" fill="#BF360C">Output</text>
  <line x1="250" y1="170" x2="300" y2="170" stroke="#546E7A" stroke-width="2" marker-end="url(#arrow)"/>
  <line x1="500" y1="170" x2="550" y2="170" stroke="#546E7A" stroke-width="2" marker-end="url(#arrow)"/>
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#546E7A"/>
    </marker>
  </defs>
</svg>
SVGEOF

# Generate (no image search needed for this simple test)
cd <your-project>/.claude/skills/visual-diagram/scripts
uv run python generate.py /tmp/test-diagram.svg --style handdrawn --output /tmp/test-output.png
```

## Full Pipeline Example

```bash
cd <your-project>/.claude/skills/visual-diagram/scripts

# 1. Parse placeholders from SVG blueprint
uv run python parse_placeholders.py /path/to/diagram.svg

# 2. Search for reference images
uv run python search_images.py /path/to/diagram_placeholders.json

# 3. Generate the final image
uv run python generate.py /path/to/diagram.svg \
  --images /path/to/diagram_images.json \
  --style handdrawn \
  --output /path/to/output.png
```

## Available Styles

| Style | Command | Look |
|-------|---------|------|
| Hand-drawn | `--style handdrawn` | Sketchy lines, warm paper texture, whiteboard feel |
| Polished | `--style polished` | Clean flat design, professional infographic |
| Blueprint | `--style blueprint` | Dark blue bg, white line art, engineering feel |
| Watercolor | `--style watercolor` | Soft colors, organic shapes, artistic |
| Minimal | `--style minimal` | Black lines on white, ultra-clean |

## Cost

- **Gemini free tier**: 15 requests/minute, 1,500/day — more than enough
- **Tavily free tier**: 1,000 credits/month — covers ~200-300 diagrams
- **Beyond free tier**: ~$0.07/image (Gemini) + $0.008/search (Tavily)

## Troubleshooting

**"No image was generated"**: The model returned only text. Simplify the SVG (fewer elements, shorter text) and retry.

**"GEMINI_API_KEY not set"**: Set the env var or create `~/.config/visual-diagram/config.json`.

**Text is garbled in output**: Reduce text length in the SVG. Nano Banana 2 handles short labels better than long paragraphs.

**Region error with Gemini**: Enable billing on your Google AI Studio project (free tier still applies, billing just unlocks EU access).
