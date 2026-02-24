package main

import (
	"fmt"
	"net/http"
	"text/template"

	"github.com/cvargas-0/otto/web"
)

var templ *template.Template

func main() {

	templ = template.Must(template.ParseFS(web.Files, "web/index.html"))

	mux := http.NewServeMux()

	fileServer := http.FileServer(http.FS(web.Files))
	mux.Handle("/assets/", fileServer)

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		if err := templ.Execute(w, nil); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	})

	fmt.Println("Serving on port 8080")
	if err := http.ListenAndServe(":8080", mux); err != nil {
		fmt.Println(err)
	}
}
