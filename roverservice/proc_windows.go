//go:build windows

package main

import (
	"bufio"
	"context"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// setSysProcAttr sets platform-specific SysProcAttr for the command
func setSysProcAttr(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: syscall.CREATE_NEW_PROCESS_GROUP,
	}
}

// killProcessGracefully gracefully terminates a Windows process
// For TUN mode processes, we use /F directly because Windows graceful
// termination can be very slow (30+ seconds) for network-related processes
func killProcessGracefully(pid int) error {
	// On Windows, "graceful" termination via taskkill without /F often hangs
	// for network processes like sing-box with TUN mode.
	// We use /F with /T to forcefully but quickly terminate the process tree.
	return killWindowsProcess(pid, true, true)
}

// killProcessForce forcefully terminates a Windows process
func killProcessForce(pid int) error {
	return killWindowsProcess(pid, true, true)
}

// killSingboxByImageName kills all sing-box processes by image name.
// Same approach as Task Manager - one taskkill command, completes in <1 second.
// No PID lookup, no verification loops. Use this for the stop handler.
func killSingboxByImageName() error {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "taskkill", "/F", "/IM", "sing-box.exe", "/T")
	output, err := cmd.CombinedOutput()
	out := string(output)
	if err != nil {
		// No process found = success (exit 128 on Windows)
		// taskkill returns exit code 128 when no matching process is found
		// The output may be empty or contain various "not found" messages
		outLower := strings.ToLower(out)
		if strings.Contains(outLower, "not found") ||
			strings.Contains(outLower, "no tasks") ||
			strings.Contains(out, "找不到") ||
			strings.Contains(out, "没有") ||
			strings.Contains(out, "ERROR: The process") ||
			out == "" {
			logInfo("No sing-box process to kill (taskkill exit 128 treated as success)")
			return nil
		}
		logWarn("taskkill sing-box.exe failed: %v, output: %s", err, out)
		return err
	}
	logInfo("taskkill sing-box.exe succeeded: %s", out)
	return nil
}

// killWindowsProcess uses taskkill to terminate a specific Windows process
// force: use /F flag for forced termination
// tree: use /T flag to terminate the entire process tree
func killWindowsProcess(pid int, force bool, tree bool) error {
	var args []string
	if force {
		args = append(args, "/F")
	}
	if tree {
		args = append(args, "/T")
	}
	args = append(args, "/pid", strconv.Itoa(pid))

	logInfo("Executing taskkill for PID %d with args: %v", pid, args)

	// Use shorter timeout for faster execution
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "taskkill", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			logWarn("taskkill timed out after 3 seconds for PID %d", pid)
			return err
		}
		logWarn("taskkill failed for PID %d: %v, output: %s", pid, err, string(output))
		return err
	}

	logInfo("taskkill succeeded for PID %d: %s", pid, string(output))
	return nil
}

// findRoverServiceProcesses finds all running roverservice processes
// Excludes the current process (the uninstaller itself)
func findRoverServiceProcesses() []int {
	var pids []int
	currentPid := syscall.Getpid()

	// Use tasklist to find roverservice.exe processes
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "tasklist", "/fo", "csv", "/nh", "/fi", "IMAGENAME eq roverservice.exe")
	output, err := cmd.Output()
	if err != nil {
		logWarn("Failed to find roverservice processes: %v", err)
		return pids
	}

	scanner := bufio.NewScanner(strings.NewReader(string(output)))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.Contains(line, "INFO: No tasks are running") {
			continue
		}

		// Parse CSV: "roverservice.exe","PID","Session Name","Session#","Mem Usage"
		parts := strings.Split(line, ",")
		if len(parts) >= 2 {
			pidStr := strings.Trim(parts[1], `"`)
			pid, err := strconv.Atoi(pidStr)
			if err == nil && pid > 0 && pid != currentPid {
				pids = append(pids, pid)
			}
		}
	}

	if len(pids) > 0 {
		logInfo("Found %d roverservice processes (excluding current process %d): %v", len(pids), currentPid, pids)
	} else {
		logInfo("No roverservice processes found (current process %d excluded)", currentPid)
	}

	return pids
}

// getWindowsServicePID returns the PID of the running service, or 0 if not found.
func getWindowsServicePID(svcName string) int {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "sc", "queryex", svcName)
	output, err := cmd.Output()
	if err != nil {
		return 0
	}
	// Parse "PID                : 1234" from output
	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		if strings.HasPrefix(strings.TrimSpace(line), "PID") {
			parts := strings.SplitN(line, ":", 2)
			if len(parts) == 2 {
				pid, err := strconv.Atoi(strings.TrimSpace(parts[1]))
				if err == nil && pid > 0 {
					return pid
				}
			}
		}
	}
	return 0
}

// killRoverServiceExcludingSelf kills all roverservice processes except current.
// Simple: tasklist to find PIDs, taskkill /F /PID for each. No graceful, no loops.
func killRoverServiceExcludingSelf() {
	pids := findRoverServiceProcesses()
	if len(pids) == 0 {
		logInfo("No roverservice service process to kill")
		return
	}
	logInfo("Killing roverservice service process(es): %v", pids)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	for _, pid := range pids {
		cmd := exec.CommandContext(ctx, "taskkill", "/F", "/PID", strconv.Itoa(pid), "/T")
		if output, err := cmd.CombinedOutput(); err != nil {
			if !strings.Contains(strings.ToLower(string(output)), "not found") {
				logWarn("taskkill PID %d: %v", pid, err)
			}
		}
	}
}

// killAllRoverServiceProcesses - alias for uninstall flow compatibility
func killAllRoverServiceProcesses() error {
	killRoverServiceExcludingSelf()
	return nil
}

