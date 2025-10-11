#!/bin/sh
mv *-min.* ./min
cd min
mv index-min.html index.html
mv script-min.js script.js
mv style-min.css style.css
mv description-min.html description.html
cd ..
