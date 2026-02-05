#!/bin/bash
node server.js &
PID=$!
sleep 3
curl -s http://localhost:3001/api/health
kill $PID
