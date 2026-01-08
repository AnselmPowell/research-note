#!/bin/bash

# generate-csp-hash.sh - Generate CSP hash for inline scripts
# This script generates SHA-256 hashes for Content Security Policy

echo "🔐 Generating CSP hashes for inline scripts..."

# Hash for the Tailwind config script in index.html
TAILWIND_SCRIPT='tailwind.config = {
        darkMode: "class",
        theme: {
          extend: {
            fontFamily: {
              sans: ["Quicksand", "sans-serif"],
              mono: ["JetBrains Mono", "monospace"],
            },
            colors: {
              // Scholar Red Palette
              scholar: {
                50: "#fef2f2",
                100: "#fce7e7",
                200: "#f7c5c5",
                300: "#f1a3a3",
                400: "#e87171",
                500: "#A36671",
                600: "#590016", // Primary Brand
                700: "#430010",
                800: "#3d0010",
                900: "#2d0008",
              },
              // Semantic
              success: {
                50: "#f0fdf4",
                500: "#22c55e",
                600: "#16a34a",
                700: "#15803d",
              },
              warning: {
                50: "#fffbeb",
                500: "#f59e0b",
                600: "#d97706",
              },
              error: {
                50: "#fef2f2",
                500: "#ef4444",
                600: "#dc2626",
              },
              info: {
                50: "#eff6ff",
                500: "#3b82f6",
                600: "#2563eb",
              },
              // Neutrals
              cream: "#FEFDFC",
              dark: {
                bg: "#0f172a",
                card: "#1e293b",
              }
            },
            boxShadow: {
              "scholar": "0 4px 12px rgba(89, 0, 22, 0.15)",
              "scholar-lg": "0 10px 24px rgba(89, 0, 22, 0.2)",
            },
            animation: {
              "fade-in": "fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards",
              "slide-up": "slideUp 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards",
            },
            keyframes: {
              fadeIn: {
                "0%": { opacity: "0", transform: "translateY(4px)" },
                "100%": { opacity: "1", transform: "translateY(0)" },
              },
              slideUp: {
                "0%": { opacity: "0", transform: "translateY(8px)" },
                "100%": { opacity: "1", transform: "translateY(0)" },
              }
            }
          }
        }
      }'

# Generate SHA-256 hash
HASH=$(echo -n "$TAILWIND_SCRIPT" | openssl dgst -sha256 -binary | base64)

echo "Generated CSP hash for Tailwind script:"
echo "'sha256-$HASH'"

echo ""
echo "Add this to your nginx.conf CSP header:"
echo "script-src 'self' 'sha256-$HASH' ..."

# Also generate hash for any other inline scripts if needed
echo ""
echo "✅ CSP hash generation complete"
