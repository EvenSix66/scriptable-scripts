//go:build linux

package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"math"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

const window = 6 * time.Hour

type point struct {
	Timestamp int64   `json:"t"`
	CPU       float64 `json:"cpu"`
	Memory    float64 `json:"mem"`
	Disk      float64 `json:"disk"`
}

type history struct {
	mu     sync.RWMutex
	points []point
}

func main() {
	address := flag.String("listen", "127.0.0.1:18765", "standalone listener")
	state := flag.String("state", "/var/lib/vps-probe/history.json", "history file")
	flag.Parse()

	h := &history{}
	data, err := os.ReadFile(*state)
	if err == nil {
		if err := json.Unmarshal(data, &h.points); err != nil {
			log.Printf("read history: %v", err)
			h.points = nil
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		log.Printf("read history: %v", err)
	}
	h.prune(time.Now())
	listener, err := openListener(*address)
	if err != nil {
		log.Fatal(err)
	}
	go h.collect(*state)

	mux := http.NewServeMux()
	mux.HandleFunc("/v1/history", h.serve)
	server := &http.Server{
		Handler: mux, ReadHeaderTimeout: 3 * time.Second,
		ReadTimeout: 5 * time.Second, WriteTimeout: 5 * time.Second,
		IdleTimeout: 20 * time.Second, MaxHeaderBytes: 8 << 10,
	}
	log.Printf("probe listening on %s", listener.Addr())
	log.Fatal(server.Serve(listener))
}

func openListener(address string) (net.Listener, error) {
	if os.Getenv("LISTEN_PID") == strconv.Itoa(os.Getpid()) && os.Getenv("LISTEN_FDS") == "1" {
		file := os.NewFile(3, "vps-probe.socket")
		defer file.Close()
		return net.FileListener(file)
	}
	return net.Listen("tcp", address)
}

func (h *history) prune(now time.Time) {
	cutoff := now.Add(-window).Unix()
	points := h.points[:0]
	for _, p := range h.points {
		if p.Timestamp >= cutoff && p.Timestamp <= now.Unix() {
			points = append(points, p)
		}
	}
	if len(points) > 361 {
		points = points[len(points)-361:]
	}
	h.points = points
}

func (h *history) collect(path string) {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	lastTotal, lastIdle, lastErr := cpuTimes()
	time.Sleep(time.Second)
	for {
		total, idle, err := cpuTimes()
		if err == nil && lastErr == nil && total > lastTotal {
			idleDelta := float64(idle) - float64(lastIdle)
			cpu := 100 * (1 - idleDelta/float64(total-lastTotal))
			p, sampleErr := sample(cpu)
			err = sampleErr
			if err == nil {
				h.mu.Lock()
				h.points = append(h.points, p)
				h.prune(time.Now())
				err = saveHistory(path, h.points)
				h.mu.Unlock()
			}
		}
		if err == nil {
			lastTotal, lastIdle, lastErr = total, idle, nil
		} else {
			log.Printf("collect sample: %v", err)
			if total > 0 {
				lastTotal, lastIdle, lastErr = total, idle, nil
			}
		}
		<-ticker.C
	}
}

func saveHistory(path string, points []point) error {
	file, err := os.CreateTemp(filepath.Dir(path), ".history-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	writeErr := json.NewEncoder(file).Encode(points)
	closeErr := file.Close()
	if writeErr != nil {
		return writeErr
	}
	if closeErr != nil {
		return closeErr
	}
	return os.Rename(file.Name(), path)
}

func (h *history) serve(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	h.mu.RLock()
	points := append([]point{}, h.points...)
	h.mu.RUnlock()
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	response := struct {
		WindowSeconds int64   `json:"window_seconds"`
		Points        []point `json:"points"`
	}{int64(window / time.Second), points}
	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("send history: %v", err)
	}
}

func sample(cpu float64) (point, error) {
	mem, err := memoryUsage()
	if err != nil {
		return point{}, err
	}
	var disk syscall.Statfs_t
	if err := syscall.Statfs("/", &disk); err != nil {
		return point{}, err
	}
	used := disk.Blocks - disk.Bfree
	if used+disk.Bavail == 0 {
		return point{}, errors.New("root filesystem has no usable blocks")
	}
	return point{time.Now().Unix(), percent(cpu), percent(mem), percent(100 * float64(used) / float64(used+disk.Bavail))}, nil
}

func cpuTimes() (total, idle uint64, err error) {
	f, err := os.Open("/proc/stat")
	if err != nil {
		return 0, 0, err
	}
	defer f.Close()
	line, err := bufio.NewReader(f).ReadString('\n')
	if err != nil {
		return 0, 0, err
	}
	fields := strings.Fields(line)
	if len(fields) < 9 || fields[0] != "cpu" {
		return 0, 0, errors.New("unexpected /proc/stat CPU row")
	}
	for i, field := range fields[1:9] {
		n, err := strconv.ParseUint(field, 10, 64)
		if err != nil {
			return 0, 0, err
		}
		total += n
		if i == 3 || i == 4 {
			idle += n
		}
	}
	return total, idle, nil
}

func memoryUsage() (float64, error) {
	data, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return 0, err
	}
	values := make(map[string]float64, 2)
	for _, line := range strings.Split(string(data), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 2 || (fields[0] != "MemTotal:" && fields[0] != "MemAvailable:") {
			continue
		}
		v, err := strconv.ParseFloat(fields[1], 64)
		if err != nil {
			return 0, err
		}
		values[fields[0]] = v
	}
	available, ok := values["MemAvailable:"]
	total := values["MemTotal:"]
	if !ok || total <= 0 {
		return 0, fmt.Errorf("missing memory counters in /proc/meminfo")
	}
	return 100 * (1 - available/total), nil
}

func percent(value float64) float64 {
	return math.Round(math.Max(0, math.Min(100, value))*10) / 10
}
