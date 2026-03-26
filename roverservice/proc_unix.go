//go:build !windows

package main

import (
	"os"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// setSysProcAttr 设置进程属性
func setSysProcAttr(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setpgid: true,
	}
}

// killProcessGracefully 向进程组发送 SIGTERM
func killProcessGracefully(pid int) error {
	// 尝试向进程组发送信号（负 PID）
	if err := syscall.Kill(-pid, syscall.SIGTERM); err != nil {
		// 降级为单进程
		return syscall.Kill(pid, syscall.SIGTERM)
	}
	return nil
}

// killProcessForce 向进程组发送 SIGKILL
func killProcessForce(pid int) error {
	if err := syscall.Kill(-pid, syscall.SIGKILL); err != nil {
		return syscall.Kill(pid, syscall.SIGKILL)
	}
	return nil
}

// killSingboxByImageName 针对 macOS 优化的进程清理逻辑
func killSingboxByImageName() error {
	const target = "sing-box"

	// 1. 获取当前所有匹配的 PID
	pids := getPidsByName(target)
	if len(pids) == 0 {
		return nil
	}

	// 2. 尝试 SIGTERM (优雅关闭)
	for _, pid := range pids {
		_ = syscall.Kill(pid, syscall.SIGTERM)
	}

	// 3. 智能等待 (最多 1.5s)
	deadline := time.Now().Add(1500 * time.Millisecond)
	for time.Now().Before(deadline) {
		if len(getPidsByName(target)) == 0 {
			return nil
		}
		time.Sleep(100 * time.Millisecond)
	}

	// 4. 强制清理仍存在的残留进程
	remaining := getPidsByName(target)
	for _, pid := range remaining {
		err := syscall.Kill(pid, syscall.SIGKILL)
		if err != nil && strings.Contains(strings.ToLower(err.Error()), "operation not permitted") {
			logWarn("[Singbox] 无法结束 PID %d: 权限不足 (EPERM)。请检查是否以 Root 运行。", pid)
		}
	}
	return nil
}

// waitForSingboxExit 轮询检测 sing-box 是否已退出
func waitForSingboxExit() {
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if len(getPidsByName("sing-box")) == 0 {
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
}

// killRoverServiceExcludingSelf 清理除自身外的其他 roverservice 实例
func killRoverServiceExcludingSelf() {
	selfPid := os.Getpid()
	pids := getPidsByName("roverservice")
	for _, pid := range pids {
		if pid != selfPid {
			logInfo("Cleaning up stale roverservice process: %d", pid)
			_ = syscall.Kill(pid, syscall.SIGKILL)
		}
	}
}

// --- 高性能辅助函数 ---

// getPidsByName 获取指定名称的所有 PID
func getPidsByName(name string) []int {
	// 在 macOS 上使用 pgrep 是最高效的非 CGO 方案
	out, err := exec.Command("pgrep", "-x", name).Output()
	if err != nil {
		return nil // 找不到进程时 pgrep 返回非零退出码
	}

	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	pids := make([]int, 0, len(lines))
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		if pid, err := strconv.Atoi(trimmed); err == nil {
			// 修复：将解析出的 pid 加入列表
			pids = append(pids, pid)
		}
	}
	return pids
}