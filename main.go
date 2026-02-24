package main

import (
	"fmt"
	"net/http"
	"strings"
	"text/template"

	"github.com/moby/moby/client"

	"github.com/cvargas-0/otto/web"
)

var templ *template.Template

type PortSummary struct {
	IP          string
	PrivatePort uint16
	PublicPort  uint16
	Type        string
}

type Container struct {
	ID      string
	Name    string
	Image   string
	Version string
	State   string
	Status  string
	Labels  map[string]string
	Ports   []PortSummary
}

type EngineInfo struct {
	Version  string
	NodeName string
	NCPU     int
	MemTotal string
}

type PageData struct {
	Running  []Container
	Paused   []Container
	Stopped  []Container
	CountRun int
	CountPau int
	CountStp int
	Engine   EngineInfo
}

func extractVersion(image string) string {
	if strings.HasPrefix(image, "sha256:") {
		return image[7:19]
	}
	if i := strings.LastIndex(image, ":"); i != -1 {
		return image[i+1:]
	}
	return "latest"
}

func main() {
	apiClient, err := client.New(client.FromEnv)
	if err != nil {
		panic(err)
	}
	defer apiClient.Close()

	templ = template.Must(template.ParseFS(web.Files, "index.html"))

	mux := http.NewServeMux()

	fileServer := http.FileServer(http.FS(web.Files))
	mux.Handle("/assets/", fileServer)

	mux.HandleFunc("POST /containers/{id}/{action}", func(w http.ResponseWriter, r *http.Request) {
		containerID := r.PathValue("id")
		action := r.PathValue("action")

		var err error
		switch action {
		case "start":
			_, err = apiClient.ContainerStart(r.Context(), containerID, client.ContainerStartOptions{})
		case "unpause":
			_, err = apiClient.ContainerUnpause(r.Context(), containerID, client.ContainerUnpauseOptions{})
		case "pause":
			_, err = apiClient.ContainerPause(r.Context(), containerID, client.ContainerPauseOptions{})
		case "stop":
			_, err = apiClient.ContainerStop(r.Context(), containerID, client.ContainerStopOptions{})
		default:
			http.Error(w, "unknown action", http.StatusBadRequest)
			return
		}

		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		result, err := apiClient.ContainerList(r.Context(), client.ContainerListOptions{
			All: true,
		})

		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		data := PageData{}

		for _, c := range result.Items {
			container := Container{
				ID:      c.ID[:10],
				Name:    strings.TrimPrefix(c.Names[0], "/"),
				Image:   c.Image,
				Version: extractVersion(c.Image),
				State:   string(c.State),
				Status:  c.Status,
				Labels:  c.Labels,
				Ports: func() []PortSummary {
					var ports []PortSummary
					for _, p := range c.Ports {
						ports = append(ports, PortSummary{
							IP:          p.IP.String(),
							PrivatePort: p.PrivatePort,
							PublicPort:  p.PublicPort,
							Type:        p.Type,
						})
					}
					return ports
				}(),
			}

			switch c.State {
			case "running":
				data.Running = append(data.Running, container)
			case "paused":
				data.Paused = append(data.Paused, container)
			default:
				data.Stopped = append(data.Stopped, container)
			}
		}

		data.CountRun = len(data.Running)
		data.CountPau = len(data.Paused)
		data.CountStp = len(data.Stopped)

		info, infoErr := apiClient.Info(r.Context(), client.InfoOptions{})
		if infoErr == nil {
			memGB := float64(info.Info.MemTotal) / (1024 * 1024 * 1024)
			data.Engine = EngineInfo{
				Version:  info.Info.ServerVersion,
				NodeName: info.Info.Name,
				NCPU:     info.Info.NCPU,
				MemTotal: fmt.Sprintf("%.1fGB", memGB),
			}
		}

		w.Header().Set("Content-Type", "text/html")
		if err := templ.Execute(w, data); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	})

	fmt.Println("Serving on port 8080")
	if err := http.ListenAndServe(":8080", mux); err != nil {
		fmt.Println(err)
	}
}
