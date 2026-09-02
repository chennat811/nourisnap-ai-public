#!/bin/bash

# Download Fredoka One
curl -o assets/fonts/FredokaOne-Regular.ttf \
  "https://fonts.gstatic.com/s/fredokaone/v14/k3kUo8kEI-tA1RRcTZGmTmHBA6aF8Bf_.ttf"

# Download Nunito static fonts
curl -o assets/fonts/Nunito-Regular.ttf \
  "https://fonts.gstatic.com/s/nunito/v26/XRXI3I6Li01BKofiOc5wtlZ2di8HDLshdTQ3j77e.ttf"

curl -o assets/fonts/Nunito-SemiBold.ttf \
  "https://fonts.gstatic.com/s/nunito/v26/XRXI3I6Li01BKofiOc5wtlZ2di8HDOQhfTQ3j77e.ttf"

curl -o assets/fonts/Nunito-Bold.ttf \
  "https://fonts.gstatic.com/s/nunito/v26/XRXI3I6Li01BKofiOc5wtlZ2di8HDFQmfTQ3j77e.ttf"

curl -o assets/fonts/Nunito-ExtraBold.ttf \
  "https://fonts.gstatic.com/s/nunito/v26/XRXI3I6Li01BKofiOc5wtlZ2di8HDIQlfTQ3j77e.ttf"

curl -o assets/fonts/Nunito-Black.ttf \
  "https://fonts.gstatic.com/s/nunito/v26/XRXI3I6Li01BKofiOc5wtlZ2di8HDK4kfTQ3j77e.ttf"

echo "Fonts downloaded successfully!"
ls -lh assets/fonts/
