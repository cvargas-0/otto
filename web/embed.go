package web

import "embed"

//go:embed index.html assets/css/styles.css assets/js/main.js
var Files embed.FS
