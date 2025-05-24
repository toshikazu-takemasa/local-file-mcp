#!/bin/sh

echo "install commitizen globally..."
npm install -g --no-progress --silent commitizen cz-conventional-changelog
echo '{ "path": "cz-conventional-changelog" }' >~/.czrc

echo "install netcat..."
sudo apt update -qq && sudo apt install -qq -y netcat-openbsd
