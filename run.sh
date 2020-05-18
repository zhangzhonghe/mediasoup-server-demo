#!/bin/bash
# -i 'rtsp://admin:123456@10.0.0.21:554/live/ch2' \

ffmpeg \
-re \
-v info \
-stream_loop -1 \
-i ./cc.mp4 \
-map 0:v:0 \
-pix_fmt yuv420p -c:v libvpx-vp9 -b:v 1000k -deadline realtime \
-strict -2 \
-f tee \
"[select=v:f=rtp:ssrc=2222:payload_type=101]rtp://10.0.0.195:35487?rtcpport=27938"
