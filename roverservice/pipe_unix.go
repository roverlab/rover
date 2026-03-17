//go:build !windows

package main

import (
	"context"
	"net"
	"time"
)

// createListener creates a unix socket listener on Unix systems
func createListener() (net.Listener, error) {
	return net.Listen("unix", socketPath)
}

// dialSocket connects to the unix socket on Unix systems
func dialSocket(ctx context.Context) (net.Conn, error) {
	return net.DialTimeout("unix", socketPath, time.Second)
}
