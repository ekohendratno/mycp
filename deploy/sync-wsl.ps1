$src = "/mnt/c/laragon/www/mycp"
$dst = "/home/srv/cp"

wsl -u root -e bash @"
rsync -a --delete \
  --exclude=".git" \
  --exclude="node_modules" \
  --exclude="data" \
  "${src}/" "${dst}/"
find "${dst}/scripts" -name '*.sh' -exec chmod +x {} +
chmod +x "${dst}/server/server.js"
cd "${dst}"
npm rebuild
systemctl restart mycp-server
"@
