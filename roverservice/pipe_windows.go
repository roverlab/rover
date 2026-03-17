//go:build windows

package main

import (
	"context"
	"net"

	"github.com/Microsoft/go-winio"
)

// createListener creates a named pipe listener on Windows
func createListener() (net.Listener, error) {
	return winio.ListenPipe(socketPath, &winio.PipeConfig{
		SecurityDescriptor: "D:(A;;GA;;;AU)(A;;GA;;;BA)(A;;GA;;;SY)",
		InputBufferSize:    65536,
		OutputBufferSize:   65536,
	})
}

// dialSocket connects to the named pipe on Windows
func dialSocket(ctx context.Context) (net.Conn, error) {
	return winio.DialPipeContext(ctx, socketPath)
}
