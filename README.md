# OS Monitor VS Code Extension

**OS Monitor** is a lightweight VS Code extension that displays your current Operating System and real-time system resource usage (CPU and RAM) directly in your Status Bar.

## Features

*   **OS Detection**: Automatically identifies if you are running on Linux, Windows, macOS, or ChromeOS.
    *   On Linux, it attempts to identify the specific distribution (e.g., Ubuntu, Fedora, AlmaLinux).
*   **Resource Monitoring**:
    *   **CPU**: Shows current CPU usage percentage.
    *   **RAM**: Shows used/total memory in GB and percentage.
*   **Disk Usage**: Shows Used/Total GB and percentage (e.g., `80/200GB 41%`).
*   **Traffic**: Shows real-time upload/download usage (e.g., Kbps, Mbps).
*   **Bandwidth**: Shows max download speed from the last speed test (Click status bar to test).
*   **Status Bar Integration**: Minimalist display in the bottom right corner.
    *   Format: `[OS Name] | CPU: XX% | RAM: Y GB | DSK: Z% | TRAF: W Kbps | BW: N Mbps`
    *   Updates every second.

## Configuration

You can customize the update interval in your VS Code settings:

*   `osMonitor.refreshInterval`: The time in milliseconds between updates (default: `1000`ms).

## Installation

1.  Download the `.vsix` file.
2.  In VS Code, go to the Extensions view.
3.  Click the "..." menu and select **"Install from VSIX..."**.
4.  Select the `os-monitor-0.0.1.vsix` file.

## Requirements

*   VS Code version 1.90.0 or higher.

## Credits

*   **Publisher**: [MarhaenDev]
*   **Homepage**: [vsix.hasanaskari.com](https://vsix.hasanaskari.com)
*   **Repository**: [github.com/marhaendev/vsix-os-monitor](https://github.com/marhaendev/vsix-os-monitor)
*   **Author**: [hasanaskari.com](https://hasanaskari.com)