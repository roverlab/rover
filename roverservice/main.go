// RoverService - Cross-platform privileged helper daemon
// This daemon runs as root/Administrator and provides HTTP API for sing-box management
// Uses kardianos/service for cross-platform service management
package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/kardianos/service"
)

const (
	// API version
	APIVersion = "1.0.0"
	// Default HTTP timeout
	DefaultTimeout = 30 * time.Second
	// Service name
	ServiceName = "RoverService"
	// Service description
	ServiceDescription = "Rover Privileged Service - Manages sing-box with elevated privileges"
)

// Platform-specific paths
var (
	// Socket/pipe path for HTTP communication
	socketPath string
	// PID file path
	pidFilePath string
)

func init() {
	if runtime.GOOS == "windows" {
		// Windows uses named pipe
		socketPath = `\\.\pipe\roverservice`
		pidFilePath = filepath.Join(os.TempDir(), "roverservice.pid")
	} else {
		// Unix uses unix domain sockets
		socketPath = "/var/run/roverservice.sock"
		pidFilePath = "/var/run/roverservice.pid"
	}
}

var (
	singboxMu     sync.Mutex
	svcLogger     service.Logger
	isUninstalling bool
)

// Response represents a standard API response
type Response struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// SingboxStatus represents sing-box process status
type SingboxStatus struct {
	Running    bool   `json:"running"`
	PID        int    `json:"pid,omitempty"`
	StartTime  int64  `json:"startTime,omitempty"`
	ConfigPath string `json:"configPath,omitempty"`
	BinaryPath string `json:"binaryPath,omitempty"`
}

// StartRequest represents the start sing-box request
type StartRequest struct {
	ConfigPath string `json:"configPath"`
	BinaryPath string `json:"binaryPath"`
}

// ProcessInfo represents a process information
type ProcessInfo struct {
	PID   int    `json:"pid"`
	PPID  int    `json:"ppid"`
	Name  string `json:"name"`
	User  string `json:"user"`
	State string `json:"state"`
}

// Global sing-box process state
var (
	singboxProcess    *exec.Cmd
	singboxPID        int
	singboxStartTime  int64
	singboxConfigPath string
	singboxBinaryPath string
	httpServer        *http.Server
)

// program implements service.Interface
type program struct{}

func (p *program) Start(s service.Service) error {
	// Start should not block. Do the actual work async.
	logInfo("Service starting...")
	go p.run()
	return nil
}

func (p *program) run() {
	// Clean up any existing socket/pipe
	cleanupSocket()

	var listener net.Listener
	var err error

	if runtime.GOOS == "windows" {
		// Windows: Create named pipe listener
		// SecurityDescriptor: Allow Authenticated Users (AU), Administrators (BA), and System (SY)
		// Note: BA only works for elevated admins due to UAC, so we need AU for non-elevated clients
		listener, err = createListener()
	} else {
		// Unix: Create unix socket listener
		listener, err = createListener()
	}

	if err != nil {
		logError("Failed to create listener: %v", err)
		return
	}

	// Set socket permissions (Unix only)
	if runtime.GOOS != "windows" {
		if err := os.Chmod(socketPath, 0666); err != nil {
			logWarn("Failed to set socket permissions: %v", err)
		}
	}

	// Write PID file
	if err := writePidFile(); err != nil {
		logWarn("Failed to write PID file: %v", err)
	}

	// Create HTTP server
	httpServer = createHTTPServer()

	logInfo("RoverService daemon started (PID: %d), listening on %s", os.Getpid(), socketPath)
	logInfo("API Version: %s", APIVersion)
	logInfo("Platform: %s/%s", runtime.GOOS, runtime.GOARCH)

	// Handle shutdown gracefully
	go func() {
		shutdown := make(chan os.Signal, 1)
		if runtime.GOOS == "windows" {
			// Windows: handle service stop signal
			signal.Notify(shutdown, syscall.SIGINT, syscall.SIGTERM)
		} else {
			signal.Notify(shutdown, syscall.SIGINT, syscall.SIGTERM, syscall.SIGHUP)
		}
		<-shutdown
		logInfo("Received shutdown signal")
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		httpServer.Shutdown(ctx)
		listener.Close()
	}()

	if err := httpServer.Serve(listener); err != nil && err != http.ErrServerClosed {
		logError("Server error: %v", err)
	}
}

func (p *program) Stop(s service.Service) error {
	// Stop should not block. Return with a few seconds.
	logInfo("Service stopping...")

	// Stop sing-box if running
	singboxMu.Lock()
	if singboxPID > 0 && isProcessAlive(singboxPID) {
		logInfo("Stopping sing-box process (PID: %d) during service stop", singboxPID)
		killProcess(singboxPID)
	}
	singboxMu.Unlock()

	// Shutdown HTTP server
	if httpServer != nil {
		if isUninstalling {
			// Force immediate shutdown during uninstall
			logInfo("Force closing HTTP server during uninstall")
			httpServer.Close()
		} else {
			// Graceful shutdown for normal stop
			logInfo("Gracefully shutting down HTTP server")
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			httpServer.Shutdown(ctx)
		}
	}

	// Cleanup
	cleanup()

	logInfo("Service stopped")
	return nil
}

func cleanupSocket() {
	if runtime.GOOS == "windows" {
		// No cleanup needed for named pipes (they're automatically removed)
		return
	}
	os.Remove(socketPath)
}

func logInfo(format string, args ...interface{}) {
	msg := fmt.Sprintf(format, args...)
	if svcLogger != nil {
		svcLogger.Info(msg)
	}
	fmt.Printf("[INFO] %s\n", msg)
}

func logError(format string, args ...interface{}) {
	msg := fmt.Sprintf(format, args...)
	if svcLogger != nil {
		svcLogger.Error(msg)
	}
	fmt.Fprintf(os.Stderr, "[ERROR] %s\n", msg)
}

func logWarn(format string, args ...interface{}) {
	msg := fmt.Sprintf(format, args...)
	if svcLogger != nil {
		svcLogger.Warning(msg)
	}
	fmt.Fprintf(os.Stderr, "[WARN] %s\n", msg)
}

// sendJSONResponse sends a JSON response
func sendJSONResponse(w http.ResponseWriter, statusCode int, resp Response) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(resp)
}

// sendSuccess sends a success response
func sendSuccess(w http.ResponseWriter, data interface{}, message string) {
	sendJSONResponse(w, http.StatusOK, Response{
		Success: true,
		Message: message,
		Data:    data,
	})
}

// sendError sends an error response
func sendError(w http.ResponseWriter, statusCode int, message string, err error) {
	errStr := ""
	if err != nil {
		errStr = err.Error()
	}
	sendJSONResponse(w, statusCode, Response{
		Success: false,
		Message: message,
		Error:   errStr,
	})
}

// handleStatus handles GET /status - returns daemon status
func handleStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed", nil)
		return
	}

	sendSuccess(w, map[string]interface{}{
		"version":    APIVersion,
		"pid":        os.Getpid(),
		"uptime":     time.Now().Unix(),
		"socketPath": socketPath,
		"platform":   runtime.GOOS,
	}, "RoverService is running")
}

// handleSingboxStatus handles GET /singbox/status - returns sing-box process status
func handleSingboxStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed", nil)
		return
	}

	singboxMu.Lock()
	defer singboxMu.Unlock()

	status := SingboxStatus{
		Running:    false,
		ConfigPath: singboxConfigPath,
		BinaryPath: singboxBinaryPath,
	}

	if singboxPID > 0 {
		// Check if process is still running
		if isProcessAlive(singboxPID) {
			status.Running = true
			status.PID = singboxPID
			status.StartTime = singboxStartTime
		} else {
			// Process died, clean up
			singboxPID = 0
			singboxStartTime = 0
		}
	}

	sendSuccess(w, status, "")
}

// handleSingboxStart handles POST /singbox/start - starts sing-box
func handleSingboxStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed", nil)
		return
	}

	var req StartRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	if req.ConfigPath == "" {
		sendError(w, http.StatusBadRequest, "configPath is required", nil)
		return
	}

	if req.BinaryPath == "" {
		sendError(w, http.StatusBadRequest, "binaryPath is required", nil)
		return
	}

	// Validate paths
	if _, err := os.Stat(req.ConfigPath); os.IsNotExist(err) {
		sendError(w, http.StatusBadRequest, "Config file not found", err)
		return
	}

	if _, err := os.Stat(req.BinaryPath); os.IsNotExist(err) {
		sendError(w, http.StatusBadRequest, "Binary file not found", err)
		return
	}

	// Brief lock: check if already running
	singboxMu.Lock()
	if singboxPID > 0 && isProcessAlive(singboxPID) {
		singboxMu.Unlock()
		sendError(w, http.StatusConflict, "sing-box is already running", nil)
		return
	}
	singboxMu.Unlock()

	// Kill existing processes WITHOUT holding lock - allows stop to proceed immediately
	if runtime.GOOS == "windows" {
		killSingboxByImageName() // taskkill /F /IM sing-box.exe /T, <1s
		time.Sleep(200 * time.Millisecond)
	} else {
		existingPids := findSingboxPids()
		if len(existingPids) > 0 {
			logInfo("Found existing sing-box processes: %v, stopping them first", existingPids)
			for _, pid := range existingPids {
				if err := killProcess(pid); err != nil {
					logWarn("Failed to stop existing sing-box process %d: %v", pid, err)
				}
			}
			time.Sleep(500 * time.Millisecond)
		}
	}

	// Start sing-box
	cmd := exec.CommandContext(context.Background(), req.BinaryPath, "run", "-c", req.ConfigPath)
	cmd.Env = os.Environ()

	// Platform-specific process settings
	setSysProcAttr(cmd)

	// Create log file
	logDir := filepath.Dir(req.ConfigPath)
	logFile := filepath.Join(logDir, "sing-box.log")

	logWriter, err := os.OpenFile(logFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		logWarn("Failed to open log file %s: %v", logFile, err)
	} else {
		cmd.Stdout = logWriter
		cmd.Stderr = logWriter
	}

	if err := cmd.Start(); err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to start sing-box", err)
		return
	}

	// Brief lock: set state
	singboxMu.Lock()
	singboxProcess = cmd
	singboxPID = cmd.Process.Pid
	singboxStartTime = time.Now().Unix()
	singboxConfigPath = req.ConfigPath
	singboxBinaryPath = req.BinaryPath
	singboxMu.Unlock()

	logInfo("Started sing-box with PID %d, config: %s", singboxPID, req.ConfigPath)

	// Wait for process to exit in goroutine
	go func() {
		err := cmd.Wait()
		singboxMu.Lock()
		if err != nil {
			logInfo("sing-box process %d exited with error: %v", singboxPID, err)
		} else {
			logInfo("sing-box process %d exited normally", singboxPID)
		}
		singboxPID = 0
		singboxStartTime = 0
		singboxMu.Unlock()
		if logWriter != nil {
			logWriter.Close()
		}
	}()

	// Wait a short time to ensure process started successfully
	time.Sleep(500 * time.Millisecond)

	// Brief lock: verify and respond
	singboxMu.Lock()
	pid := singboxPID
	st := singboxStartTime
	cfg := singboxConfigPath
	bin := singboxBinaryPath
	singboxMu.Unlock()

	if pid > 0 && isProcessAlive(pid) {
		sendSuccess(w, map[string]interface{}{
			"pid":        pid,
			"startTime":  st,
			"configPath": cfg,
			"binaryPath":  bin,
		}, "sing-box started successfully")
	} else {
		sendError(w, http.StatusInternalServerError, "sing-box started but exited immediately", nil)
	}
}

// handleSingboxStop handles POST /singbox/stop - stops sing-box
// Rewritten for speed: Task Manager kills in <1s, we match that with direct taskkill by image name.
func handleSingboxStop(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed", nil)
		return
	}

	singboxMu.Lock()
	singboxPID = 0
	singboxStartTime = 0
	singboxMu.Unlock()

	if runtime.GOOS == "windows" {
		// Windows: taskkill /F /IM sing-box.exe /T - same as Task Manager, <1 second
		if err := killSingboxByImageName(); err != nil {
			sendError(w, http.StatusInternalServerError, "Failed to stop sing-box", err)
			return
		}
	} else {
		// Unix: pkill -9 -f sing-box
		cmd := exec.Command("pkill", "-9", "-f", "sing-box")
		if output, err := cmd.CombinedOutput(); err != nil {
			if !strings.Contains(string(output), "No matching processes") {
				logWarn("pkill sing-box failed: %v, output: %s", err, string(output))
			}
		}
	}

	logInfo("sing-box stopped successfully")
	sendSuccess(w, nil, "sing-box stopped successfully")
}

// handleSingboxRestart handles POST /singbox/restart - restarts sing-box
func handleSingboxRestart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed", nil)
		return
	}

	singboxMu.Lock()

	// Store current config paths
	configPath := singboxConfigPath
	binaryPath := singboxBinaryPath

	singboxMu.Unlock()

	if configPath == "" || binaryPath == "" {
		sendError(w, http.StatusBadRequest, "No previous sing-box configuration found", nil)
		return
	}

	// Stop existing process (use fast path on Windows)
	singboxMu.Lock()
	singboxPID = 0
	singboxStartTime = 0
	singboxMu.Unlock()
	if runtime.GOOS == "windows" {
		killSingboxByImageName()
	} else {
		exec.Command("pkill", "-9", "-f", "sing-box").Run()
	}
	time.Sleep(300 * time.Millisecond)

	// Start with same config
	req := StartRequest{
		ConfigPath: configPath,
		BinaryPath: binaryPath,
	}

	// Reuse start handler
	body, _ := json.Marshal(req)
	newReq, _ := http.NewRequest(http.MethodPost, "/singbox/start", strings.NewReader(string(body)))
	newReq.Header.Set("Content-Type", "application/json")

	// Use a response recorder
	handleSingboxStart(w, newReq)
}

// handleListProcesses handles GET /processes - lists all sing-box processes
func handleListProcesses(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed", nil)
		return
	}

	pids := findSingboxPids()
	processes := make([]ProcessInfo, 0)

	for _, pid := range pids {
		info := getProcessInfo(pid)
		if info != nil {
			processes = append(processes, *info)
		}
	}

	sendSuccess(w, processes, "")
}

// handleKillProcess handles POST /processes/kill - kills a specific process
func handleKillProcess(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed", nil)
		return
	}

	var req struct {
		PID   int  `json:"pid"`
		Force bool `json:"force"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	if req.PID <= 0 {
		sendError(w, http.StatusBadRequest, "Invalid PID", nil)
		return
	}

	if !isProcessAlive(req.PID) {
		sendSuccess(w, nil, "Process is not running")
		return
	}

	var err error
	if req.Force {
		err = forceKillProcess(req.PID)
	} else {
		err = killProcess(req.PID)
	}

	if err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to kill process", err)
		return
	}

	sendSuccess(w, nil, fmt.Sprintf("Process %d killed successfully", req.PID))
}

// handleCheckPath handles POST /check-path - checks if a path exists
func handleCheckPath(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed", nil)
		return
	}

	var req struct {
		Path string `json:"path"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	if req.Path == "" {
		sendError(w, http.StatusBadRequest, "path is required", nil)
		return
	}

	info, err := os.Stat(req.Path)
	if os.IsNotExist(err) {
		sendSuccess(w, map[string]interface{}{
			"exists": false,
		}, "Path does not exist")
		return
	}

	if err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to check path", err)
		return
	}

	sendSuccess(w, map[string]interface{}{
		"exists": true,
		"isDir":  info.IsDir(),
		"size":   info.Size(),
		"mode":   info.Mode().String(),
	}, "")
}

// handleReadFile handles POST /read-file - reads file content
func handleReadFile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed", nil)
		return
	}

	var req struct {
		Path     string `json:"path"`
		MaxBytes int64  `json:"maxBytes"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	if req.Path == "" {
		sendError(w, http.StatusBadRequest, "path is required", nil)
		return
	}

	if req.MaxBytes <= 0 {
		req.MaxBytes = 1024 * 1024 // Default 1MB
	}

	file, err := os.Open(req.Path)
	if err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to open file", err)
		return
	}
	defer file.Close()

	// Limit read size
	limited := io.LimitReader(file, req.MaxBytes)
	content, err := io.ReadAll(limited)
	if err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to read file", err)
		return
	}

	sendSuccess(w, map[string]interface{}{
		"content": string(content),
		"size":    len(content),
	}, "")
}

// Platform-specific helper functions

func isProcessAlive(pid int) bool {
	if pid <= 0 {
		return false
	}

	if runtime.GOOS == "windows" {
		return isWindowsProcessAlive(pid)
	}

	process, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	err = process.Signal(syscall.Signal(0))
	return err == nil
}

// isProcessAliveQuick is for hot paths (e.g. killProcess wait loop). Uses 1s timeout on Windows
// to avoid blocking the HTTP handler for 25+ seconds when stopping TUN mode sing-box.
func isProcessAliveQuick(pid int) bool {
	if pid <= 0 {
		return false
	}
	if runtime.GOOS == "windows" {
		return isWindowsProcessAliveWithTimeout(pid, 1*time.Second)
	}
	return isProcessAlive(pid) // Unix: Signal(0) is instant
}

func isWindowsProcessAlive(pid int) bool {
	return isWindowsProcessAliveWithTimeout(pid, 5*time.Second)
}

// isWindowsProcessAliveWithTimeout checks process existence with configurable timeout.
func isWindowsProcessAliveWithTimeout(pid int, timeout time.Duration) bool {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "tasklist", "/fi", fmt.Sprintf("PID eq %d", pid), "/nh")
	output, err := cmd.Output()
	if err != nil {
		return false
	}
	return strings.Contains(string(output), strconv.Itoa(pid))
}

func killProcess(pid int) error {
	if pid <= 0 {
		return fmt.Errorf("invalid PID")
	}

	logInfo("Killing process %d", pid)

	// Try graceful termination first (on Windows this is already forceful for speed)
	if err := killProcessGracefully(pid); err != nil {
		logWarn("Failed to kill process %d: %v, trying force kill", pid, err)
		return forceKillProcess(pid)
	}

	// Wait for process to exit - use quick check (1s timeout) to avoid blocking HTTP handler.
	// Previous: 5 iterations × 5s = 25s worst case, caused 30s timeout on TUN stop.
	for i := 0; i < 5; i++ {
		if !isProcessAliveQuick(pid) {
			logInfo("Process %d terminated successfully", pid)
			return nil
		}
		time.Sleep(100 * time.Millisecond)
	}

	// Force kill if still running
	if isProcessAliveQuick(pid) {
		logWarn("Process %d still running after initial kill, force killing", pid)
		return forceKillProcess(pid)
	}

	return nil
}

func forceKillProcess(pid int) error {
	if pid <= 0 {
		return fmt.Errorf("invalid PID")
	}
	return killProcessForce(pid)
}

func findSingboxPids() []int {
	if runtime.GOOS == "windows" {
		return findWindowsSingboxPids()
	}

	// Unix: Use pgrep to find sing-box processes
	cmd := exec.Command("pgrep", "-x", "sing-box")
	output, err := cmd.Output()
	if err != nil {
		return nil
	}

	var pids []int
	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	for _, line := range lines {
		if line == "" {
			continue
		}
		pid, err := strconv.Atoi(strings.TrimSpace(line))
		if err == nil && pid > 0 {
			pids = append(pids, pid)
		}
	}

	return pids
}

func findWindowsSingboxPids() []int {
	// Use tasklist to find sing-box.exe processes. 2s timeout to avoid blocking stop handler.
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "tasklist", "/fo", "csv", "/nh", "/fi", "IMAGENAME eq sing-box.exe")
	output, err := cmd.Output()
	if err != nil {
		return nil
	}

	var pids []int
	scanner := bufio.NewScanner(strings.NewReader(string(output)))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.Contains(line, "INFO: No tasks are running") {
			continue
		}
		// Parse CSV: "sing-box.exe","PID","Session Name","Session#","Mem Usage"
		parts := strings.Split(line, ",")
		if len(parts) >= 2 {
			pidStr := strings.Trim(parts[1], `"`)
			pid, err := strconv.Atoi(pidStr)
			if err == nil && pid > 0 {
				pids = append(pids, pid)
			}
		}
	}

	return pids
}

func getProcessInfo(pid int) *ProcessInfo {
	if runtime.GOOS == "windows" {
		return getWindowsProcessInfo(pid)
	}
	return getUnixProcessInfo(pid)
}

func getWindowsProcessInfo(pid int) *ProcessInfo {
	// Use wmic to get process info
	// Use context with timeout to prevent hanging
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "wmic", "process", "where", fmt.Sprintf("ProcessId=%d", pid),
		"get", "Name,ParentProcessId,ExecutablePath", "/format:csv")
	output, err := cmd.Output()
	if err != nil {
		return nil
	}

	// Parse CSV output
	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	if len(lines) < 2 {
		return nil
	}

	// Skip header, find data line
	for _, line := range lines[1:] {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.Split(line, ",")
		if len(parts) >= 4 {
			ppid, _ := strconv.Atoi(parts[2])
			return &ProcessInfo{
				PID:   pid,
				PPID:  ppid,
				Name:  parts[1],
				User:  "unknown", // Would need more complex WMI query
				State: "running",
			}
		}
	}

	return nil
}

func getUnixProcessInfo(pid int) *ProcessInfo {
	// Read process info from /proc
	procPath := fmt.Sprintf("/proc/%d/stat", pid)
	data, err := os.ReadFile(procPath)
	if err != nil {
		return nil
	}

	content := string(data)

	// Find the last closing parenthesis
	lastParen := strings.LastIndex(content, ")")
	if lastParen == -1 {
		return nil
	}

	// Extract fields after the closing parenthesis
	fields := strings.Fields(content[lastParen+1:])
	if len(fields) < 2 {
		return nil
	}

	// Extract name (between parentheses)
	nameStart := strings.Index(content, "(")
	name := content[nameStart+1 : lastParen]

	state := fields[0]
	ppid, _ := strconv.Atoi(fields[1])

	// Get process owner
	procStatusPath := fmt.Sprintf("/proc/%d/status", pid)
	statusData, err := os.ReadFile(procStatusPath)
	user := "unknown"
	if err == nil {
		lines := strings.Split(string(statusData), "\n")
		for _, line := range lines {
			if strings.HasPrefix(line, "Uid:") {
				fields := strings.Fields(line)
				if len(fields) >= 2 {
					uid, _ := strconv.Atoi(fields[1])
					user = getUnixUserName(uid)
				}
				break
			}
		}
	}

	return &ProcessInfo{
		PID:   pid,
		PPID:  ppid,
		Name:  name,
		User:  user,
		State: state,
	}
}

func getUnixUserName(uid int) string {
	cmd := exec.Command("id", "-nu", strconv.Itoa(uid))
	output, err := cmd.Output()
	if err != nil {
		return strconv.Itoa(uid)
	}
	return strings.TrimSpace(string(output))
}

// HTTP server setup

func createHTTPServer() *http.Server {
	mux := http.NewServeMux()

	// Daemon status
	mux.HandleFunc("/status", handleStatus)
	mux.HandleFunc("/version", handleStatus)

	// Sing-box management
	mux.HandleFunc("/singbox/status", handleSingboxStatus)
	mux.HandleFunc("/singbox/start", handleSingboxStart)
	mux.HandleFunc("/singbox/stop", handleSingboxStop)
	mux.HandleFunc("/singbox/restart", handleSingboxRestart)

	// Process management
	mux.HandleFunc("/processes", handleListProcesses)
	mux.HandleFunc("/processes/kill", handleKillProcess)

	// File operations
	mux.HandleFunc("/check-path", handleCheckPath)
	mux.HandleFunc("/read-file", handleReadFile)

	server := &http.Server{
		Handler:      mux,
		ReadTimeout:  DefaultTimeout,
		WriteTimeout: DefaultTimeout,
	}

	return server
}

func cleanup() {
	cleanupSocket()
	os.Remove(pidFilePath)
	logInfo("Cleaned up socket and pid files")
}

func writePidFile() error {
	pid := os.Getpid()
	return os.WriteFile(pidFilePath, []byte(strconv.Itoa(pid)), 0644)
}

func isServiceInstalled() bool {
	if runtime.GOOS == "windows" {
		return isWindowsServiceInstalled()
	}
	return isUnixServiceInstalled()
}

func isUnixServiceInstalled() bool {
	// Check if plist file exists (kardianos/service uses {Name}.plist format)
	if _, err := os.Stat("/Library/LaunchDaemons/RoverService.plist"); err == nil {
		return true
	}
	// Also check if binary exists
	if _, err := os.Stat("/Library/PrivilegedHelperTools/roverservice"); err == nil {
		return true
	}
	return false
}

func isWindowsServiceInstalled() bool {
	// Use sc query to check if service is installed
	// Use context with timeout to prevent hanging
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "sc", "query", ServiceName)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return false
	}
	out := string(output)
	// Service does not exist: English "does not exist", Chinese "指定的服务不存在"
	return len(output) > 0 &&
		!strings.Contains(strings.ToLower(out), "does not exist") &&
		!strings.Contains(out, "指定的服务不存在")
}

// uninstallService stops and removes the RoverService service. Clean linear flow.
func uninstallService(s service.Service) {
	isUninstalling = true
	defer func() {
		cleanup()
		fmt.Println("Service uninstalled successfully")
	}()

	if runtime.GOOS == "windows" {
		uninstallWindows(s)
	} else {
		uninstallUnix(s)
	}
}

func uninstallWindows(s service.Service) {
	// 1. sc stop (may hang if service doesn't respond)
	exec.Command("sc", "stop", ServiceName).Run()
	time.Sleep(500 * time.Millisecond)

	// 2. Kill service process by PID (from sc queryex) or by tasklist - excludes self
	killRoverServiceExcludingSelf()
	time.Sleep(500 * time.Millisecond)

	// 3. sc delete
	out, err := exec.Command("sc", "delete", ServiceName).CombinedOutput()
	output := string(out)
	if err != nil {
		if strings.Contains(strings.ToLower(output), "does not exist") ||
			strings.Contains(output, "指定的服务不存在") ||
			strings.Contains(output, "1072") {
			return // Already gone or marked for deletion
		}
		logWarn("sc delete: %v", err)
		if s.Uninstall() != nil {
			fmt.Fprintf(os.Stderr, "Failed to delete service: %v\n", err)
			os.Exit(1)
		}
	}
}

func uninstallUnix(s service.Service) {
	s.Stop()
	time.Sleep(1 * time.Second)
	if err := s.Uninstall(); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to uninstall service: %v\n", err)
		os.Exit(1)
	}
}

func main() {
	// Check if running with elevated privileges
	if runtime.GOOS == "windows" {
		// Windows: Check if running as Administrator
		if !isWindowsAdmin() {
			fmt.Fprintln(os.Stderr, "RoverService must be run as Administrator")
			os.Exit(1)
		}
	} else {
		// Unix: Check if running as root
		if os.Geteuid() != 0 {
			fmt.Fprintln(os.Stderr, "RoverService must be run as root")
			os.Exit(1)
		}
	}

	// Service configuration
	svcConfig := &service.Config{
		Name:        ServiceName,
		DisplayName: "RoverService",
		Description: ServiceDescription,
	}

	prg := &program{}
	s, err := service.New(prg, svcConfig)
	if err != nil {
		logError("Failed to create service: %v", err)
		os.Exit(1)
	}

	// Create service logger
	svcLogger, err = s.Logger(nil)
	if err != nil {
		logWarn("Failed to create service logger: %v", err)
	}

	// Handle command line arguments
	if len(os.Args) > 1 {
		cmd := os.Args[1]
		switch cmd {
		case "install":
			err := s.Install()
			if err != nil {
				fmt.Fprintf(os.Stderr, "Failed to install service: %v\n", err)
				os.Exit(1)
			}
			fmt.Println("Service installed successfully")
			// Start the service after installation
			err = s.Start()
			if err != nil {
				fmt.Fprintf(os.Stderr, "Failed to start service: %v\n", err)
				os.Exit(1)
			}
			fmt.Println("Service started successfully")
			return

		case "uninstall":
			uninstallService(s)
			return

		case "start":
			err := s.Start()
			if err != nil {
				fmt.Fprintf(os.Stderr, "Failed to start service: %v\n", err)
				os.Exit(1)
			}
			fmt.Println("Service started successfully")
			return

		case "stop":
			err := s.Stop()
			if err != nil {
				fmt.Fprintf(os.Stderr, "Failed to stop service: %v\n", err)
				os.Exit(1)
			}
			fmt.Println("Service stopped successfully")
			return

		case "restart":
			err := s.Restart()
			if err != nil {
				fmt.Fprintf(os.Stderr, "Failed to restart service: %v\n", err)
				os.Exit(1)
			}
			fmt.Println("Service restarted successfully")
			return

		case "status":
			if isServiceInstalled() {
				fmt.Println("Service is installed")
				if isSocketAvailable() {
					fmt.Println("Service is running")
				} else {
					fmt.Println("Service is not running")
				}
			} else {
				fmt.Println("Service is not installed")
			}
			return

		case "run":
			// Run directly (for debugging)
			err = s.Run()
			if err != nil {
				logError("Service run error: %v", err)
				os.Exit(1)
			}
			return

		case "help", "-h", "--help":
			fmt.Println("RoverService - Cross-platform privileged helper daemon")
			fmt.Println("")
			fmt.Println("Usage:")
			fmt.Println("  roverservice           Run as a service (managed by launchd/Windows Service)")
			fmt.Println("  roverservice install   Install and start the service")
			fmt.Println("  roverservice uninstall Stop and uninstall the service")
			fmt.Println("  roverservice start     Start the service")
			fmt.Println("  roverservice stop      Stop the service")
			fmt.Println("  roverservice restart   Restart the service")
			fmt.Println("  roverservice status    Check service status")
			fmt.Println("  roverservice run       Run directly (for debugging)")
			fmt.Println("  roverservice help      Show this help message")
			return

		default:
			fmt.Fprintf(os.Stderr, "Unknown command: %s\n", cmd)
			fmt.Fprintf(os.Stderr, "Run '%s help' for usage information\n", os.Args[0])
			os.Exit(1)
		}
	}

	// Default: run as service
	err = s.Run()
	if err != nil {
		logError("Service error: %v", err)
		os.Exit(1)
	}
}

func isSocketAvailable() bool {
	conn, err := dialSocket(context.Background())
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

func isWindowsAdmin() bool {
	if runtime.GOOS != "windows" {
		return os.Geteuid() == 0
	}

	// On Windows, try to perform an action that requires admin privileges
	// Try to open the service manager
	// Use context with timeout to prevent hanging
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "sc", "query", "EventLog")
	err := cmd.Run()
	return err == nil
}

