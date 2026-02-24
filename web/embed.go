package web

import "embed"

//go:embed index.html assets/css/styles.css
var Files embed.FS
