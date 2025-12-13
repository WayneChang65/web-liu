#!/bin/bash

# This script minifies HTML, CSS, and JavaScript files
# and places them in the ./min directory.

# Exit immediately if a command exits with a non-zero status.
set -e

# Create the output directory if it doesn't exist
echo "Creating ./min directory..."
mkdir -p min

# --- Minify HTML files ---
echo "Minifying HTML..."
html-minifier-terser index.html \
    --output min/index.html \
    --collapse-whitespace \
    --remove-comments \
    --remove-optional-tags \
    --remove-redundant-attributes \
    --remove-script-type-attributes \
    --minify-css true \
    --minify-js true

html-minifier-terser description.html \
    --output min/description.html \
    --collapse-whitespace \
    --remove-comments \
    --remove-optional-tags \
    --remove-redundant-attributes \
    --remove-script-type-attributes \
    --minify-css true \
    --minify-js true

# --- Minify JavaScript files ---
echo "Minifying JavaScript..."
terser script.js -o min/script.js -c -m
terser boshiamy-data.js -o min/boshiamy-data.js -c -m
terser stats.js -o min/stats.js -c -m

# --- Minify CSS files ---
echo "Minifying CSS..."
csso style.css -o min/style.css

echo "\n✅ Minification complete! All files are in the ./min directory."
