//go:build !windows

package main

import (
	"os"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
)

// setSysProcAttr sets platform-specific SysProcAttr for the command
func setSysProcAttr(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setpgid: true,
	}
}

// killProcessGracefully sends SIGTERM to the process group
func killProcessGracefully(pid int) error {
	process, err := os.FindProcess(pid)
	if err != nil {
		return err
	}

	// Kill the process group (negative PID)
	if err := syscall.Kill(-pid, syscall.SIGTERM); err != nil {
		// Fallback to single process
		return process.Signal(syscall.SIGTERM)
	}
	return nil
}

// killProcessForce sends SIGKILL to the process group
func killProcessForce(pid int) error {
	process, err := os.FindProcess(pid)
	if err != nil {
		return err
	}

	if err := syscall.Kill(-pid, syscall.SIGKILL); err != nil {
		return process.Signal(syscall.SIGKILL)
	}
	return nil
}

// killSingboxByImageName kills all sing-box processes by name.
// On Unix, we use pkill to find and kill processes by name.
func killSingboxByImageName() error {
	cmd := exec.Command("pkill", "-9", "-x", "sing-box")
	output, err := cmd.CombinedOutput()
	if err != nil {
		out := string(output)
		if strings.Contains(out, "No matching process") ||
			strings.Contains(out, "no process found") {
			return nil // No process to kill is success
		}
		return err
	}
	return nil
}

// killRoverServiceExcludingSelf kills all roverservice processes except the current one.
// On Unix, we use pkill to find and kill processes by name.
func killRoverServiceExcludingSelf() {
	currentPid := os.Getpid()

	// Find all roverservice processes
	cmd := exec.Command("pgrep", "-x", "roverservice")
	output, err := cmd.Output()
	if err != nil {
		return // No processes found
	}

	// Parse PIDs and kill each one (except self)
	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	for _, line := range lines {
		if line == "" {
			continue
		}
		pid, err := strconv.Atoi(strings.TrimSpace(line))
		if err != nil {
			continue
		}
		if pid != currentPid {
			logInfo("Killing roverservice process %d", pid)
			syscall.Kill(pid, syscall.SIGKILL)
		}
	}
}
