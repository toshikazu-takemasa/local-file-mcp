#!/bin/sh

echo "add safe directory to global git config..."
git config --global --add safe.directory "${CONTAINER_WORKSPACE_FOLDER}"

echo "fix permission of node_modules..."
GROUP=$USER
sudo chown ${USER}:${GROUP} node_modules
