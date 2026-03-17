/**
 * macOS DNS Management for TUN Mode
 *
 * When TUN mode is enabled on macOS, sets system DNS to 172.19.0.2
 * (the TUN interface gateway address) so that DNS queries go through
 * sing-box's DNS server via the TUN interface.
 * Automatically restores original DNS when TUN mode is disabled.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from './logger';

const execAsync = promisify(exec);
const log = createLogger('DNS-macOS');

// Store original DNS servers for each network service
interface DnsBackup {
    service: string;
    dnsServers: string[];
}

// In-memory backup of original DNS settings
let dnsBackup: DnsBackup[] = [];

/**
 * Get all network services on macOS
 * Returns array of service names like ['Wi-Fi', 'Ethernet', ...]
 */
async function getNetworkServices(): Promise<string[]> {
    try {
        const { stdout } = await execAsync('networksetup -listallnetworkservices');
        const lines = stdout.trim().split('\n');
        // First line is the header "Network Services", skip it
        // Also skip services that start with asterisk (disabled)
        return lines
            .slice(1)
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('*'));
    } catch (err: any) {
        log.error(`Failed to get network services: ${err.message}`);
        return [];
    }
}

/**
 * Get DNS servers for a specific network service
 */
async function getDnsServers(service: string): Promise<string[]> {
    try {
        const { stdout } = await execAsync(`networksetup -getdnsservers "${service}"`);
        const lines = stdout.trim().split('\n');
        
        // If no DNS is set, it returns "There aren't any DNS servers set on Wi-Fi."
        if (lines[0].includes("aren't any DNS servers")) {
            return [];
        }
        
        // Filter out empty lines and return valid IP addresses
        return lines
            .map(line => line.trim())
            .filter(line => line && isValidIp(line));
    } catch (err: any) {
        log.error(`Failed to get DNS servers for ${service}: ${err.message}`);
        return [];
    }
}

/**
 * Check if a string is a valid IP address
 */
function isValidIp(ip: string): boolean {
    // IPv4 pattern
    const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    // IPv6 pattern (simplified)
    const ipv6Pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
    
    if (ipv4Pattern.test(ip)) {
        // Validate each octet is 0-255
        const octets = ip.split('.');
        return octets.every(octet => {
            const num = parseInt(octet, 10);
            return num >= 0 && num <= 255;
        });
    }
    
    return ipv6Pattern.test(ip);
}

/**
 * Set DNS servers for a specific network service
 * Pass empty array to clear DNS (use DHCP)
 */
async function setDnsServers(service: string, dnsServers: string[]): Promise<boolean> {
    try {
        if (dnsServers.length === 0) {
            // Clear DNS servers (use DHCP)
            await execAsync(`networksetup -setdnsservers "${service}" empty`);
            log.info(`Cleared DNS servers for ${service} (using DHCP)`);
        } else {
            // Set specific DNS servers
            const dnsArgs = dnsServers.join(' ');
            await execAsync(`networksetup -setdnsservers "${service}" ${dnsArgs}`);
            log.info(`Set DNS servers for ${service}: ${dnsArgs}`);
        }
        return true;
    } catch (err: any) {
        log.error(`Failed to set DNS servers for ${service}: ${err.message}`);
        return false;
    }
}

/**
 * Set system DNS to 172.19.0.2 for TUN mode
 * Backs up current DNS settings first
 */
export async function setTunDns(): Promise<boolean> {
    // Only run on macOS
    if (process.platform !== 'darwin') {
        log.info('setTunDns: Not macOS, skipping');
        return true;
    }

    log.info('Setting system DNS to 172.19.0.2 for TUN mode...');

    try {
        // Clear any existing backup
        dnsBackup = [];

        // Get all network services
        const services = await getNetworkServices();
        if (services.length === 0) {
            log.warn('No network services found');
            return false;
        }

        log.info(`Found network services: ${services.join(', ')}`);

        let successCount = 0;
        
        for (const service of services) {
            // Get current DNS servers
            const currentDns = await getDnsServers(service);
            
            // Backup current DNS settings
            dnsBackup.push({
                service,
                dnsServers: currentDns,
            });
            
            log.info(`Current DNS for ${service}: ${currentDns.length > 0 ? currentDns.join(', ') : '(DHCP)'}`);

            // Set DNS to 172.19.0.2 (TUN interface gateway)
            const success = await setDnsServers(service, ['172.19.0.2']);
            if (success) {
                successCount++;
            }
        }

        if (successCount === services.length) {
            log.info('Successfully set DNS to 172.19.0.2 for all network services');
            return true;
        } else {
            log.warn(`Set DNS for ${successCount}/${services.length} network services`);
            return successCount > 0;
        }
    } catch (err: any) {
        log.error(`Failed to set TUN DNS: ${err.message}`);
        return false;
    }
}

/**
 * Restore original DNS settings when TUN mode is disabled
 */
export async function restoreDns(): Promise<boolean> {
    // Only run on macOS
    if (process.platform !== 'darwin') {
        log.info('restoreDns: Not macOS, skipping');
        return true;
    }

    log.info('Restoring original DNS settings...');

    // Check if we have backup
    if (dnsBackup.length === 0) {
        log.info('No DNS backup found, nothing to restore');
        return true;
    }

    try {
        let successCount = 0;

        for (const backup of dnsBackup) {
            // Restore DNS servers
            const success = await setDnsServers(backup.service, backup.dnsServers);
            if (success) {
                successCount++;
                log.info(`Restored DNS for ${backup.service}: ${backup.dnsServers.length > 0 ? backup.dnsServers.join(', ') : '(DHCP)'}`);
            }
        }

        // Clear backup after restoration
        dnsBackup = [];

        if (successCount === dnsBackup.length) {
            log.info('Successfully restored DNS settings for all network services');
            return true;
        } else {
            log.warn(`Restored DNS for ${successCount}/${dnsBackup.length} network services`);
            return successCount > 0;
        }
    } catch (err: any) {
        log.error(`Failed to restore DNS: ${err.message}`);
        return false;
    }
}

/**
 * Clear DNS backup without restoring (for cleanup)
 */
export function clearDnsBackup(): void {
    dnsBackup = [];
    log.info('DNS backup cleared');
}

/**
 * Check if DNS has been modified (backup exists)
 */
export function isDnsModified(): boolean {
    return dnsBackup.length > 0;
}
