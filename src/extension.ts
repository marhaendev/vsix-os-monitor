
import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs';
import * as cp from 'child_process';
import * as https from 'https';

let myStatusBarItem: vscode.StatusBarItem;
let lastSpeedTestResult = 'N/A';
let isTestingSpeed = false;

export function activate(context: vscode.ExtensionContext) {
    // Register command to run speed test
    const speedTestDisposable = vscode.commands.registerCommand('os-monitor.checkSpeed', () => {
        runSpeedTest();
    });
    context.subscriptions.push(speedTestDisposable);

    // Register a command to update status bar manually if needed
    const updateDisposable = vscode.commands.registerCommand('os-monitor.update', () => {
        updateStatusBarItem();
    });
    context.subscriptions.push(updateDisposable);

    // Create status bar item
    myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    myStatusBarItem.command = 'os-monitor.checkSpeed'; // Click to run speed test
    context.subscriptions.push(myStatusBarItem);

    // Initial update
    updateStatusBarItem();
    myStatusBarItem.show();

    // Update every second (configurable)
    const config = vscode.workspace.getConfiguration('osMonitor');
    const interval = config.get<number>('refreshInterval', 1000);

    setInterval(updateStatusBarItem, interval);
}

async function updateStatusBarItem() {
    const config = vscode.workspace.getConfiguration('osMonitor');
    const showOS = config.get<boolean>('showOS', true);
    const showCPU = config.get<boolean>('showCPU', true);
    const showRAM = config.get<boolean>('showRAM', true);
    const showDisk = config.get<boolean>('showDisk', true);
    const showTraffic = config.get<boolean>('showTraffic', true);
    const showBandwidth = config.get<boolean>('showBandwidth', true);
    const iconOnly = config.get<boolean>('iconOnly', false);

    const osName = getOSName();
    const resources = await getResources();
    const bwStr = isTestingSpeed ? 'Testing...' : lastSpeedTestResult;

    // Parse simple values for status bar (keeping details for tooltip)
    const ramPercent = resources.ram.split(' ').pop() || resources.ram;

    const diskParts = resources.disk.split(' ');
    const diskPercent = diskParts.length > 1 ? diskParts[diskParts.length - 1] : resources.disk;

    const parts: string[] = [];
    if (showOS) parts.push(`$(desktop-download) ${osName}`);
    if (showCPU) parts.push(`$(pulse) ${iconOnly ? '' : 'CPU '}${resources.cpu}%`);
    if (showRAM) parts.push(`$(server) ${iconOnly ? '' : 'RAM '}${ramPercent}`);
    if (showDisk) parts.push(`$(database) ${iconOnly ? '' : 'DISK '}${diskPercent}`);
    if (showTraffic) parts.push(`$(arrow-swap) ${iconOnly ? '' : 'TRAF '}${resources.traf}`);
    if (showBandwidth) parts.push(`$(dashboard) ${iconOnly ? '' : 'BW '}${bwStr}`);

    myStatusBarItem.text = parts.join(' | ');
    myStatusBarItem.tooltip = `OS: ${osName}\nCPU Usage: ${resources.cpu}%\nRAM Usage: ${resources.ram}\nDisk Usage: ${resources.disk}\nTraffic: ${resources.traf}\nBandwidth: ${bwStr} (Click to Test)`;
}

function getOSName(): string {
    const platform = os.platform();
    if (platform === 'linux') {
        // Try to distinguish ChromeOS or specific distros
        try {
            if (fs.existsSync('/etc/os-release')) {
                const content = fs.readFileSync('/etc/os-release', 'utf8');
                if (content.toLowerCase().includes('chrome os') || content.toLowerCase().includes('chromium os')) {
                    return 'ChromeOS';
                }
                const match = content.match(/^PRETTY_NAME="?([^"]+)"?/m);
                if (match) {
                    return match[1];
                }
            }
        } catch (e) {
            // Ignore error
        }
        return 'Linux';
    } else if (platform === 'win32') {
        return 'Windows';
    } else if (platform === 'darwin') {
        return 'macOS';
    }
    return platform;
}

async function getResources(): Promise<{ cpu: string, ram: string, disk: string, traf: string }> {
    const cpus = os.cpus();
    // This is a rough estimation based on snapshot, ideally we need diff over time
    // For a simple monitor, we might want to store previous state, but let's try this simple one first
    // Actually, os.cpus() returns times since boot. To get current usage we need to compare two snapshots.
    // Let's implement a simple stateful CPU usage calculator for better accuracy if possible, 
    // but for now let's stick to a simpler approach or just accept the limitation.
    // Wait, simple 'snapshot' of times since boot doesn't give current load. 
    // We MUST compare with previous tick.
    const currentCpuUsage = calculateCpuUsage(cpus);

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const ramPercentage = ((usedMem / totalMem) * 100).toFixed(1);

    // Format RAM usage (e.g. 4.2GB / 16GB)
    const usedMemGB = (usedMem / (1024 * 1024 * 1024)).toFixed(1);
    const totalMemGB = (totalMem / (1024 * 1024 * 1024)).toFixed(1);

    const diskUsage = await getDiskUsage();
    const trafUsage = await getTrafUsage();

    return {
        cpu: currentCpuUsage,
        ram: `${usedMemGB}/${totalMemGB}GB ${ramPercentage}%`,
        disk: diskUsage,
        traf: trafUsage
    };
}

let previousCpus = os.cpus();

function calculateCpuUsage(currentCpus: os.CpuInfo[]): string {
    let idleDiff = 0;
    let totalDiff = 0;

    for (let i = 0; i < currentCpus.length; i++) {
        const current = currentCpus[i];
        const prev = previousCpus[i];

        let currentTotal = 0;
        let prevTotal = 0;

        for (const type in current.times) {
            currentTotal += (current.times as any)[type];
        }
        for (const type in prev.times) {
            prevTotal += (prev.times as any)[type];
        }

        const currentIdle = current.times.idle;
        const prevIdle = prev.times.idle;

        idleDiff += (currentIdle - prevIdle);
        totalDiff += (currentTotal - prevTotal);
    }

    previousCpus = currentCpus;

    if (totalDiff === 0) return "0.0"; // Avoid division by zero

    const usage = ((1 - idleDiff / totalDiff) * 100).toFixed(1);
    return usage;
}

function getDiskUsage(): Promise<string> {
    return new Promise((resolve) => {
        if (os.platform() === 'win32') {
            // Simple Windows check using wmic (very basic)
            cp.exec('wmic logicaldisk get size,freespace,caption', (err, stdout) => {
                if (err) return resolve('?');
                // Parse logic for C: usually
                const lines = stdout.trim().split('\n').filter(line => line.trim() !== '');
                // Skip header
                for (let i = 1; i < lines.length; i++) {
                    const parts = lines[i].trim().split(/\s+/);
                    // Caption, FreeSpace, Size (order depends on get)
                    // wmic output is fixed width, but split space works if no spaces in caption
                    if (parts.length >= 3 && parts[parts.length - 3].includes('C:')) {
                        const freeBytes = parseInt(parts[parts.length - 2]);
                        const sizeBytes = parseInt(parts[parts.length - 1]);
                        const usedBytes = sizeBytes - freeBytes;

                        const usedGB = (usedBytes / (1024 * 1024 * 1024)).toFixed(0);
                        const totalGB = (sizeBytes / (1024 * 1024 * 1024)).toFixed(0);
                        const percent = ((usedBytes / sizeBytes) * 100).toFixed(0);

                        return resolve(`${usedGB}/${totalGB}GB ${percent}%`);
                    }
                }
                resolve('?');
            });
        } else {
            // Linux / macOS - Use df -h --output=size,used,pcent /
            cp.exec('df -h --output=size,used,pcent /', (err, stdout) => {
                if (err) return resolve('?');
                const lines = stdout.trim().split('\n');
                // Output:
                // Size  Used Use%
                // 20G   10G  53%
                if (lines.length >= 2) {
                    const parts = lines[1].trim().split(/\s+/);
                    if (parts.length >= 3) {
                        const size = parts[0]; // e.g., 20G
                        const used = parts[1]; // e.g., 10G
                        const percent = parts[2]; // e.g., 53%
                        return resolve(`${used}/${size} ${percent}`);
                    }
                }
                resolve('?');
            });
        }
    });
}

let prevNet = { bytes: 0, time: 0 };

async function getTrafUsage(): Promise<string> {
    if (os.platform() !== 'linux') {
        return 'N/A'; // Not implemented for non-linux yet in this simple version
    }

    return new Promise((resolve) => {
        fs.readFile('/proc/net/dev', 'utf8', (err, data) => {
            if (err) return resolve('0Kbps');

            const now = Date.now();
            let totalBytes = 0;

            const lines = data.split('\n');
            // Skip first 2 headers
            for (let i = 2; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.includes('lo:')) continue; // Skip Loopback

                const parts = line.split(/\s+/);
                let rx = 0;
                let tx = 0;

                // Handle different formatting
                if (parts[0].includes(':')) {
                    if (parts[0].endsWith(':')) {
                        rx = parseInt(parts[1], 10) || 0;
                        tx = parseInt(parts[9], 10) || 0;
                    } else {
                        const sub = parts[0].split(':');
                        rx = parseInt(sub[1], 10) || 0;
                        tx = parseInt(parts[8], 10) || 0;
                    }
                } else if (parts[1] && parts[1].startsWith(':')) {
                    rx = parseInt(parts[2], 10) || 0;
                    tx = parseInt(parts[10], 10) || 0;
                }

                totalBytes += rx + tx;
            }

            let mbps = 0;
            if (prevNet.time > 0) {
                const timeDiffSec = (now - prevNet.time) / 1000;
                const bytesDiff = totalBytes - prevNet.bytes;
                if (timeDiffSec > 0 && bytesDiff >= 0) {
                    const bps = bytesDiff / timeDiffSec;
                    mbps = (bps * 8) / (1000 * 1000);
                }
            }

            prevNet = { bytes: totalBytes, time: now };

            if (mbps < 1) {
                resolve((mbps * 1000).toFixed(0) + 'Kbps');
            } else {
                resolve(mbps.toFixed(1) + 'Mbps');
            }
        });
    });

}

async function runSpeedTest() {
    if (isTestingSpeed) { return; }

    isTestingSpeed = true;
    lastSpeedTestResult = 'Testing...';
    updateStatusBarItem();

    const url = "https://speed.cloudflare.com/__down?bytes=10000000"; // 10MB for quick test

    const startTime = Date.now();
    let downloadedBytes = 0;

    try {
        await new Promise<void>((resolve, reject) => {
            https.get(url, (res) => {
                if (res.statusCode !== 200) {
                    res.resume();
                    reject(new Error(`Request failed: ${res.statusCode}`));
                    return;
                }

                res.on('data', (chunk) => {
                    downloadedBytes += chunk.length;
                });

                res.on('end', () => {
                    resolve();
                });

                res.on('error', (err) => {
                    reject(err);
                });
            }).on('error', (err) => {
                reject(err);
            });
        });

        const endTime = Date.now();
        const durationSec = (endTime - startTime) / 1000;
        const bps = (downloadedBytes * 8) / durationSec;
        const mbps = bps / (1000 * 1000);

        lastSpeedTestResult = `${mbps.toFixed(1)}Mbps`;
        vscode.window.showInformationMessage(`Speed Test Complete: ${lastSpeedTestResult}`);

    } catch (error: any) {
        lastSpeedTestResult = 'Error';
        vscode.window.showErrorMessage(`Speed Test Failed: ${error.message}`);
    } finally {
        isTestingSpeed = false;
        updateStatusBarItem();
    }
}


export function deactivate() { }
