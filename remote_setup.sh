#!/bin/bash
set -e

echo "--- Updating system packages ---"
sudo apt update && sudo apt upgrade -y

echo "--- Installing Node.js 20 ---"
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git

echo "--- Installing PM2 ---"
sudo npm install -g pm2

echo "--- Cloning/Updating repository ---"
if [ ! -d "delta-neutral-bot" ]; then
  git clone https://github.com/daejaeonboy/delta-neutral-bot.git
fi
cd delta-neutral-bot
git pull

echo "--- Installing dependencies ---"
npm install

echo "--- Building frontend ---"
npm run build

echo "--- Setup Complete! ---"
echo "--- To start the bot, run: cd delta-neutral-bot && pm2 start server.js --name 'bot-backend' ---"
